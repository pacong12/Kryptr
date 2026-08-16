import { Inject, Injectable } from '@nestjs/common';
import type { OrderExecution, TransactionIntent } from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import { ORDER_STORE, type OrderStore } from '../domain/order-store.port';
import {
  EXECUTION_STORE,
  type ExecutionStore,
} from '../domain/execution-store.port';
import { KILL_SWITCH, type KillSwitchPort } from '../domain/kill-switch.port';
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
 *   claim → kill switch → order liveness → re-quote → gate → record
 *
 * The claim happens FIRST and is the exactly-once anchor. Quote/gate
 * failures THROW (retryable at the queue layer) and leave the claim
 * resumable; kill-switch and liveness failures FINALIZE the execution
 * as failed (non-retryable). The worker stays keyless: an approved
 * decision ends at the unsigned preview boundary, exactly like the
 * interactive flow.
 */
@Injectable()
export class ExecuteOrderSlotUseCase {
  constructor(
    @Inject(EXECUTION_STORE) private readonly executionStore: ExecutionStore,
    @Inject(KILL_SWITCH) private readonly killSwitch: KillSwitchPort,
    @Inject(ORDER_STORE) private readonly orderStore: OrderStore,
    @Inject(WALLET_REPOSITORY) private readonly wallets: WalletRepository,
    @Inject(DEX_AGGREGATOR) private readonly dex: DexAggregatorPort,
    @Inject(QUOTE_STORE) private readonly quoteStore: QuoteStore,
    private readonly evaluateIntent: EvaluateIntentUseCase,
  ) {}

  async execute(input: {
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
      // prior attempt is still in flight; terminal means duplicate.
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
        throw new DomainError(
          'duplicate_execution',
          `slot "${input.orderId}:${input.slotKey}" already finished as "${existing.status}"`,
          409,
        );
      }
      execution = existing; // idempotent continuation of a crashed attempt
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

    // 6. NEW intent, deterministic id — the gate sees a first-class
    // intent, never a pre-approved execution.
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

    // 7. Full gate. Decisions are NEVER retried — a rejection is final
    // for this execution attempt.
    const decision = await this.evaluateIntent.execute(intent);
    if (decision.result === 'approved') {
      execution = await this.executionStore.update(execution.id, {
        status: 'submitted',
        finishedAt: new Date().toISOString(),
        detail: 'gate approved; unsigned execution ready (dry-run boundary)',
      });
      await this.orderStore
        .setStatus(order.id, 'filled', at)
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
