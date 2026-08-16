import { Inject, Injectable } from '@nestjs/common';
import type {
  Order,
  OrderExecution,
  TransactionIntent,
} from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import { KeyedMutex } from '../../common/keyed-mutex';
import { ORDER_STORE, type OrderStore } from '../domain/order-store.port';
import {
  EXECUTION_STORE,
  type ExecutionStore,
} from '../domain/execution-store.port';
import { KILL_SWITCH, type KillSwitchPort } from '../domain/kill-switch.port';
import {
  TRIGGER_PRICE,
  type TriggerPricePort,
} from '../domain/trigger-price.port';
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from '../../wallet/domain/wallet-repository.port';
import {
  DEX_AGGREGATOR,
  type DexAggregatorPort,
} from '../../trading/domain/dex-aggregator.port';
import {
  QUOTE_STORE,
  type QuoteStore,
} from '../../trading/domain/quote-store.port';
import { EvaluateIntentUseCase } from '../../security/application/evaluate-intent.usecase';
import {
  TRIGGER_CONFIG,
  type TriggerConfig,
} from '../domain/trigger-evaluation';
import {
  LIMIT_REJECTION_PREFIX,
  oneShotUnspent,
} from '../domain/execution-rules';

/** Origin allow-listed by the gate for automation (stage A prep). */
export const AUTOMATION_ORIGIN = 'automation:order-worker';

/** Execution statuses that mean "this slot is done — never re-run". */
const TERMINAL_EXECUTIONS = new Set([
  'submitted',
  'confirmed',
  'failed',
  'cancelled',
  'gate_rejected',
]);

/**
 * Execute ONE claimed (order, slot) — the stage-2 processor body
 * (freeze §5). Every run is a NEW TransactionIntent through the FULL
 * gate; no pre-authorization, no shortcut. Order of side effects:
 *
 *   claim → kill switch → order liveness → re-quote → limit bound
 *   re-check → gate → post-gate re-check → record
 *
 * The claim happens FIRST and is the exactly-once anchor. Quote/gate
 * failures THROW (retryable at the queue layer) and leave the claim
 * resumable; kill-switch and liveness failures FINALIZE the execution
 * as failed (non-retryable). The worker stays keyless: an approved
 * decision ends at the unsigned preview boundary, exactly like the
 * interactive flow.
 *
 * Review fixes baked in:
 *  - OW-2: the whole body runs under a per-slot KeyedMutex, and a
 *    continuation must win the store's reclaim CAS — two processors can
 *    never work the same slot concurrently.
 *  - OW-1: after an 'approved' decision the kill state and order
 *    liveness are RE-READ before the execution is marked submitted.
 *  - M2: limit orders re-check the execution-time price against the
 *    limit bound BEFORE the intent is built; violation rejects the
 *    execution fail-closed and leaves the order open (re-armable).
 *  - H1: a successful DCA slot returns the order to 'open' (recurring);
 *    only the final slot fills. The current Order contract has no end
 *    condition for DCA, so every successful slot is mid-cycle.
 */
@Injectable()
export class ExecuteOrderSlotUseCase {
  private readonly slotLock = new KeyedMutex();

  constructor(
    @Inject(EXECUTION_STORE) private readonly executionStore: ExecutionStore,
    @Inject(KILL_SWITCH) private readonly killSwitch: KillSwitchPort,
    @Inject(ORDER_STORE) private readonly orderStore: OrderStore,
    @Inject(WALLET_REPOSITORY) private readonly wallets: WalletRepository,
    @Inject(DEX_AGGREGATOR) private readonly dex: DexAggregatorPort,
    @Inject(QUOTE_STORE) private readonly quoteStore: QuoteStore,
    @Inject(TRIGGER_PRICE) private readonly triggerPrice: TriggerPricePort,
    @Inject(TRIGGER_CONFIG) private readonly triggerConfig: TriggerConfig,
    private readonly evaluateIntent: EvaluateIntentUseCase,
  ) {}

  async execute(input: {
    orderId: string;
    slotKey: string;
  }): Promise<OrderExecution> {
    return this.slotLock.runExclusive(`${input.orderId}:${input.slotKey}`, () =>
      this.run(input),
    );
  }

  private async run(input: {
    orderId: string;
    slotKey: string;
  }): Promise<OrderExecution> {
    const at = new Date().toISOString();
    let execution = await this.executionStore.claim(
      input.orderId,
      input.slotKey,
      at,
    );

    if (!execution) {
      // Redelivery or a concurrent claim. Resumable only while the
      // prior attempt is still non-terminal — and only by winning the
      // reclaim CAS (OW-2 ownership).
      const existing = await this.executionStore.findById(
        `${input.orderId}:${input.slotKey}`,
      );
      if (!existing) {
        throw new DomainError(
          'duplicate_execution',
          `claim lost for "${input.orderId}:${input.slotKey}" with no record`,
          409,
        );
      }
      if (TERMINAL_EXECUTIONS.has(existing.status)) {
        if (oneShotUnspent(existing)) {
          // M2/D2 re-arm: the previous attempt refused to violate the
          // limit bound OR was stopped by the kill switch — the
          // one-shot was never spent. Reset the deterministic slot
          // record and run the fresh trigger.
          execution = await this.executionStore.update(existing.id, {
            status: 'claimed',
            intentId: null,
            finishedAt: null,
            detail: undefined,
          });
        } else {
          throw new DomainError(
            'duplicate_execution',
            `slot "${input.orderId}:${input.slotKey}" already finished as "${existing.status}"`,
            409,
          );
        }
      } else {
        const reclaimed = await this.executionStore.reclaim(existing.id, at);
        if (!reclaimed) {
          throw new DomainError(
            'duplicate_execution',
            `slot "${input.orderId}:${input.slotKey}" reclaim lost`,
            409,
          );
        }
        execution = reclaimed; // idempotent continuation of a crashed attempt
      }
    }

    // 1. Kill switch — re-checked on EVERY attempt, including resume.
    const killState = await this.killSwitch.getState();
    if (killState.mode !== 'off') {
      execution = await this.executionStore.update(execution.id, {
        status: 'failed',
        finishedAt: at,
        detail: 'kill_switch_active',
      });
      if (killState.mode === 'cancel_active') {
        await this.orderStore
          .setStatus(input.orderId, 'cancelled', at)
          .catch(() => undefined);
      } else {
        // D2 (freeze §3 resume intent): pause_new must not strand the
        // order in 'triggered' — the scheduler only scans 'open', so a
        // triggered order would be permanently dormant after the kill
        // switch lifts. Revert; the post-gate re-check keeps the next
        // attempt safe.
        await this.revertTriggeredToOpen(input.orderId, at);
      }
      return execution;
    }

    // 2. Order must exist and still be live.
    const order = await this.orderStore.findById(input.orderId);
    if (!order) {
      return this.fail(execution, 'order_not_found', at);
    }
    if (order.status !== 'open' && order.status !== 'triggered') {
      return this.fail(execution, `order_not_live:${order.status}`, at);
    }
    if (order.type !== 'dca' && order.type !== 'limit') {
      return this.fail(execution, 'order_type_unsupported', at);
    }

    // 3. Mark triggered (idempotent on resume).
    if (order.status === 'open') {
      await this.orderStore.setStatus(order.id, 'triggered', at);
    }

    // 4. Taker resolved SERVER-SIDE (rule #32).
    const wallet = await this.wallets.findById(order.walletId);
    if (!wallet) {
      return this.fail(execution, 'wallet_not_found', at);
    }

    // 5. Re-quote at execution time (MEV). Throw = retryable class;
    // the claim stays resumable for the redelivery.
    const assetIn = order.side === 'sell' ? order.baseAsset : order.quoteAsset;
    const assetOut = order.side === 'sell' ? order.quoteAsset : order.baseAsset;
    const quote = await this.dex.getQuote({
      walletId: order.walletId,
      chain: order.chain,
      assetIn,
      assetOut,
      amount: order.amount,
      taker: wallet.address,
    });
    await this.quoteStore.save(quote);
    execution = await this.executionStore.update(execution.id, {
      status: 'quoted',
      detail: `quote:${quote.id}`,
    });

    // 6. M2 ruling: limit orders re-verify the execution-time price
    // against the limit bound BEFORE any intent is built. Violation is
    // a fail-closed rejection — the order returns to 'open' and the
    // one-shot stays unspent (re-armable on the next trigger).
    if (order.type === 'limit') {
      const violation = await this.checkLimitBound(order);
      if (violation) {
        execution = await this.executionStore.update(execution.id, {
          status: 'failed',
          finishedAt: new Date().toISOString(),
          detail: `${LIMIT_REJECTION_PREFIX}: ${violation}`,
        });
        await this.orderStore
          .setStatus(order.id, 'open', new Date().toISOString())
          .catch(() => undefined);
        return execution;
      }
    }

    // 7. NEW intent, deterministic id — the gate sees a first-class
    // intent, never a pre-approved execution. minBuyAmount stays the
    // quote's slippage floor (gate-consistent, M2 ruling); the limit
    // bound is enforced by the re-check above, not by minBuyAmount.
    const intent: TransactionIntent = {
      id: `intent:${order.id}:${input.slotKey}`,
      walletId: order.walletId,
      chain: order.chain,
      kind: 'swap',
      to: wallet.address,
      asset: assetIn,
      amount: quote.amountIn,
      origin: AUTOMATION_ORIGIN,
      createdAt: at,
      swap: {
        quoteId: quote.id,
        buyAsset: assetOut,
        minBuyAmount: quote.minAmountOut,
        maxSlippageBps: quote.slippageBps,
        quoteExpiresAt: quote.expiresAt,
      },
    };
    execution = await this.executionStore.update(execution.id, {
      intentId: intent.id,
    });

    // 8. Full gate. Decisions are NEVER retried — a rejection is final
    // for this execution attempt.
    const decision = await this.evaluateIntent.execute(intent);
    if (decision.result === 'approved') {
      // OW-1: the gate decision is not a latch. Re-read the kill state
      // and order liveness BEFORE marking submitted — a kill switch
      // flip or a concurrent cancellation between decision and record
      // must win.
      const killNow = await this.killSwitch.getState();
      if (killNow.mode !== 'off') {
        execution = await this.executionStore.update(execution.id, {
          status: 'failed',
          finishedAt: new Date().toISOString(),
          detail: 'kill_switch_active',
        });
        if (killNow.mode === 'cancel_active') {
          await this.orderStore
            .setStatus(order.id, 'cancelled', new Date().toISOString())
            .catch(() => undefined);
        } else {
          // D2: same resume-intent revert as the claim-time kill path.
          await this.revertTriggeredToOpen(order.id, new Date().toISOString());
        }
        return execution;
      }
      const freshOrder = await this.orderStore.findById(order.id);
      if (
        !freshOrder ||
        (freshOrder.status !== 'open' && freshOrder.status !== 'triggered')
      ) {
        return this.fail(
          execution,
          freshOrder
            ? `order_not_live:${freshOrder.status}`
            : 'order_not_found',
          new Date().toISOString(),
        );
      }

      execution = await this.executionStore.update(execution.id, {
        status: 'submitted',
        finishedAt: new Date().toISOString(),
        detail: 'gate approved; unsigned execution ready (dry-run boundary)',
      });
      // H1: DCA is RECURRING — a successful mid-cycle slot returns the
      // order to 'open' for the next slot. Only the final slot fills;
      // the current Order contract has no DCA end condition, so every
      // successful DCA slot is mid-cycle (freeze §1 amendment).
      const finalStatus = order.type === 'dca' ? 'open' : 'filled';
      await this.orderStore
        .setStatus(order.id, finalStatus, new Date().toISOString())
        .catch(() => undefined);
      return execution;
    }
    execution = await this.executionStore.update(execution.id, {
      status: 'gate_rejected',
      finishedAt: new Date().toISOString(),
      detail: `gate ${decision.result}: ${decision.reason}`,
    });
    await this.orderStore
      .setStatus(order.id, 'failed', at)
      .catch(() => undefined);
    return execution;
  }

  /**
   * D2 recovery: a kill-switch stop (pause_new) must not strand the
   * order in 'triggered' — the scheduler only scans 'open' and the
   * kill-switch fan-out only sees open+paused, so a triggered order
   * would never run again even after the switch lifts (freeze §3
   * resume intent). Reverting to 'open' is safe BECAUSE the post-gate
   * re-check exists: a still-active switch stops the next attempt too.
   */
  private async revertTriggeredToOpen(
    orderId: string,
    at: string,
  ): Promise<void> {
    const current = await this.orderStore.findById(orderId);
    if (current?.status === 'triggered') {
      await this.orderStore
        .setStatus(orderId, 'open', at)
        .catch(() => undefined);
    }
  }

  /**
   * M2 execution-time bound check. Returns null when the limit is
   * still satisfied; otherwise a fail-closed reason string. Same
   * side-aware comparison and staleness ladder as the trigger itself —
   * an unknown or stale print at execution time rejects, never trades.
   * Staleness uses the wired TriggerConfig (env-overridable, D4).
   */
  private async checkLimitBound(order: Order): Promise<string | null> {
    const print = await this.triggerPrice.getPrint({
      chain: order.chain,
      baseAsset: order.baseAsset,
      quoteAsset: order.quoteAsset,
    });
    const price = print ? Number(print.priceUsd) : Number.NaN;
    if (!print || !Number.isFinite(price) || price <= 0) {
      return 'trigger_price_unknown at execution time';
    }
    const ageMs = Date.now() - Date.parse(print.observedAt);
    if (ageMs > this.triggerConfig.maxAgeMs) {
      return 'trigger_price_stale at execution time';
    }
    const limitPrice = Number(order.limitPrice);
    if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
      return 'limit price missing or invalid';
    }
    const satisfied =
      order.side === 'buy' ? price <= limitPrice : price >= limitPrice;
    if (!satisfied) {
      return `price ${price} no longer satisfies limit ${limitPrice} (${order.side})`;
    }
    return null;
  }

  private async fail(
    execution: OrderExecution,
    detail: string,
    at: string,
  ): Promise<OrderExecution> {
    return this.executionStore.update(execution.id, {
      status: 'failed',
      finishedAt: at,
      detail,
    });
  }
}
