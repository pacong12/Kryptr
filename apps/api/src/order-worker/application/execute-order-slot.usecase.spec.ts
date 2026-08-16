import type { SecurityDecision, SwapQuote } from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import { InMemoryExecutionStore } from '../infrastructure/in-memory-execution.store';
import { InMemoryOrderStore } from '../infrastructure/in-memory-order.store';
import { InMemoryKillSwitch } from '../infrastructure/in-memory-kill-switch';
import { InMemoryWalletRepository } from '../../wallet/infrastructure/in-memory-wallet.repository';
import { InMemoryQuoteStore } from '../../trading/infrastructure/in-memory-quote-store';
import type { DexAggregatorPort } from '../../trading/domain/dex-aggregator.port';
import type { EvaluateIntentUseCase } from '../../security/application/evaluate-intent.usecase';
import type { TriggerPricePort } from '../domain/trigger-price.port';
import { DEFAULT_TRIGGER_CONFIG } from '../domain/trigger-evaluation';
import type { TriggerPricePrint } from '@kryptr/shared-types';
import {
  AUTOMATION_ORIGIN,
  ExecuteOrderSlotUseCase,
} from './execute-order-slot.usecase';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bfa02913' as const;
const TAKER = '0x1111111111111111111111111111111111111111' as const;

function quote(overrides: Partial<SwapQuote> = {}): SwapQuote {
  return {
    id: 'quote-1',
    source: 'static-mock',
    chain: 'base',
    assetIn: USDC,
    assetOut: null,
    amountIn: '3000000000',
    amountOut: '1000000000000000000',
    price: 1 / 3000,
    minAmountOut: '995000000000000000',
    slippageBps: 50,
    route: [],
    fetchedAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 60_000).toISOString(),
    ...overrides,
  };
}

function print(
  priceUsd: string,
  observedAtMs: number = NOW,
): TriggerPricePrint {
  return {
    source: 'static',
    priceUsd,
    observedAt: new Date(observedAtMs).toISOString(),
  };
}

function decision(result: SecurityDecision['result']): SecurityDecision {
  return {
    intentId: 'intent:ord-1:slot-0',
    result,
    reason: result === 'approved' ? 'within policy' : 'blocked',
    decisionUsd: 3000,
    decidedAt: new Date(NOW).toISOString(),
  } as SecurityDecision;
}

describe('ExecuteOrderSlotUseCase (stage-2 core)', () => {
  let executions: InMemoryExecutionStore;
  let orders: InMemoryOrderStore;
  let killSwitch: InMemoryKillSwitch;
  let wallets: InMemoryWalletRepository;
  let quoteStore: InMemoryQuoteStore;
  let dex: jest.Mocked<Pick<DexAggregatorPort, 'getQuote'>> & DexAggregatorPort;
  let triggerPrice: { getPrint: jest.Mock };
  let triggerConfig: { maxAgeMs: number; deviationBps: number };
  let evaluate: { execute: jest.Mock };
  let usecase: ExecuteOrderSlotUseCase;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW));
    executions = new InMemoryExecutionStore();
    orders = new InMemoryOrderStore();
    killSwitch = new InMemoryKillSwitch();
    wallets = new InMemoryWalletRepository();
    quoteStore = new InMemoryQuoteStore();
    await wallets.save({
      id: 'w-1',
      address: TAKER,
      ownerId: 'owner-1',
      chains: ['base'],
      createdAt: new Date(NOW).toISOString(),
      lastKeyRotationAt: null,
    });
    await orders.save({
      id: 'ord-1',
      walletId: 'w-1',
      type: 'dca',
      status: 'open',
      chain: 'base',
      baseAsset: null,
      quoteAsset: USDC,
      side: 'buy',
      amount: '3000000000',
      limitPrice: null,
      interval: 'P1D',
      createdAt: new Date(NOW - 86_400_000).toISOString(),
    });
    dex = {
      getQuote: jest.fn().mockResolvedValue(quote()),
      buildSwapTx: jest.fn(),
      health: jest.fn(),
    } as never;
    triggerPrice = {
      getPrint: jest.fn().mockResolvedValue(print('3000')),
    };
    triggerConfig = { ...DEFAULT_TRIGGER_CONFIG };
    evaluate = { execute: jest.fn().mockResolvedValue(decision('approved')) };
    usecase = new ExecuteOrderSlotUseCase(
      executions,
      killSwitch,
      orders,
      wallets,
      dex,
      quoteStore,
      triggerPrice as unknown as TriggerPricePort,
      triggerConfig,
      evaluate as unknown as EvaluateIntentUseCase,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs the full ladder: claim → triggered → re-quote → gate → submitted (DCA back to open, H1)', async () => {
    const execution = await usecase.execute({
      orderId: 'ord-1',
      slotKey: 'slot-0',
    });

    expect(execution.status).toBe('submitted');
    expect(execution.intentId).toBe('intent:ord-1:slot-0');

    // Every execution is a NEW intent through the FULL gate.
    expect(evaluate.execute).toHaveBeenCalledTimes(1);
    const intent = evaluate.execute.mock.calls[0][0];
    expect(intent.id).toBe('intent:ord-1:slot-0');
    expect(intent.origin).toBe(AUTOMATION_ORIGIN);
    expect(intent.kind).toBe('swap');
    // Taker resolved SERVER-SIDE, never client-chosen (rule #32).
    expect(intent.to).toBe(TAKER);
    expect(dex.getQuote).toHaveBeenCalledWith(
      expect.objectContaining({ taker: TAKER, walletId: 'w-1' }),
    );
    // Sell-side match: intent mirrors the quote it is bound to.
    expect(intent.asset).toBe(USDC);
    expect(intent.amount).toBe('3000000000');
    expect(intent.swap).toEqual({
      quoteId: 'quote-1',
      buyAsset: null,
      minBuyAmount: '995000000000000000',
      maxSlippageBps: 50,
      quoteExpiresAt: quote().expiresAt,
    });
    // Quote stored so the gate's bind check can verify it.
    expect(await quoteStore.findById('quote-1')).not.toBeNull();
    // Order lifecycle (H1): DCA is RECURRING — open → triggered → back
    // to open for the next slot. Only the final slot fills, and the
    // current contract has no DCA end condition.
    expect((await orders.findById('ord-1'))?.status).toBe('open');
  });

  it('exactly-once: a terminal slot rejects every later execution as duplicate', async () => {
    await usecase.execute({ orderId: 'ord-1', slotKey: 'slot-0' });
    await expect(
      usecase.execute({ orderId: 'ord-1', slotKey: 'slot-0' }),
    ).rejects.toMatchObject({ code: 'duplicate_execution' });
    // The gate saw exactly ONE intent for the slot.
    expect(evaluate.execute).toHaveBeenCalledTimes(1);
  });

  it('DCA is recurring: distinct slots each execute once, order stays open (H1)', async () => {
    await usecase.execute({ orderId: 'ord-1', slotKey: 'slot-0' });
    expect((await orders.findById('ord-1'))?.status).toBe('open');
    // The next slot is an independent claim — NOT order_not_live, since
    // the mid-cycle success returned the order to 'open'.
    const second = await usecase.execute({
      orderId: 'ord-1',
      slotKey: 'slot-1',
    });
    expect(second.status).toBe('submitted');
    expect(evaluate.execute).toHaveBeenCalledTimes(2);
    expect((await orders.findById('ord-1'))?.status).toBe('open');
  });

  it('limit one-shot: a successful execution FILLS the order (H1 final slot)', async () => {
    await orders.save({
      id: 'ord-limit',
      walletId: 'w-1',
      type: 'limit',
      status: 'open',
      chain: 'base',
      baseAsset: null,
      quoteAsset: USDC,
      side: 'buy',
      amount: '3000000000',
      limitPrice: '3100',
      interval: null,
      createdAt: new Date(NOW).toISOString(),
    });
    const execution = await usecase.execute({
      orderId: 'ord-limit',
      slotKey: 'once',
    });
    expect(execution.status).toBe('submitted');
    expect((await orders.findById('ord-limit'))?.status).toBe('filled');
  });

  it('resumes a crashed in-flight claim instead of double-executing', async () => {
    // Simulate: claim survived, process died before quoting.
    await executions.claim('ord-1', 'slot-0', new Date(NOW).toISOString());
    const execution = await usecase.execute({
      orderId: 'ord-1',
      slotKey: 'slot-0',
    });
    expect(execution.status).toBe('submitted');
    expect(evaluate.execute).toHaveBeenCalledTimes(1);
  });

  it.each(['pause_new', 'cancel_active'] as const)(
    'kill switch %s fails the execution at claim time, before ANY side effect',
    async (mode) => {
      await killSwitch.setMode(mode, {
        actor: 'deck',
        reason: 'halt',
        at: new Date(NOW).toISOString(),
      });
      const execution = await usecase.execute({
        orderId: 'ord-1',
        slotKey: 'slot-0',
      });
      expect(execution.status).toBe('failed');
      expect(execution.detail).toBe('kill_switch_active');
      expect(dex.getQuote).not.toHaveBeenCalled();
      expect(evaluate.execute).not.toHaveBeenCalled();
    },
  );

  it('cancel_active also cancels the order; pause_new leaves it open', async () => {
    await killSwitch.setMode('pause_new', {
      actor: 'deck',
      reason: 'halt',
      at: new Date(NOW).toISOString(),
    });
    await usecase.execute({ orderId: 'ord-1', slotKey: 'slot-0' });
    expect((await orders.findById('ord-1'))?.status).toBe('open');

    await killSwitch.setMode('cancel_active', {
      actor: 'deck',
      reason: 'halt',
      at: new Date(NOW).toISOString(),
    });
    await usecase.execute({ orderId: 'ord-1', slotKey: 'slot-1' });
    expect((await orders.findById('ord-1'))?.status).toBe('cancelled');
  });

  it('a missing order finalizes the claim as failed (never throws)', async () => {
    const execution = await usecase.execute({
      orderId: 'ghost',
      slotKey: 'slot-0',
    });
    expect(execution.status).toBe('failed');
    expect(execution.detail).toBe('order_not_found');
  });

  it('a cancelled order is not executed (order_not_live)', async () => {
    await orders.setStatus('ord-1', 'cancelled', new Date(NOW).toISOString());
    const execution = await usecase.execute({
      orderId: 'ord-1',
      slotKey: 'slot-0',
    });
    expect(execution.status).toBe('failed');
    expect(execution.detail).toContain('order_not_live');
    expect(dex.getQuote).not.toHaveBeenCalled();
  });

  it.each(['rejected', 'needs_human_approval'] as const)(
    'gate %s finalizes: execution gate_rejected, order failed',
    async (result) => {
      evaluate.execute.mockResolvedValue(decision(result));
      const execution = await usecase.execute({
        orderId: 'ord-1',
        slotKey: 'slot-0',
      });
      expect(execution.status).toBe('gate_rejected');
      expect(execution.detail).toContain(result);
      expect((await orders.findById('ord-1'))?.status).toBe('failed');
    },
  );

  it('quote failures THROW (retryable class) and leave the claim resumable', async () => {
    dex.getQuote.mockRejectedValue(
      new DomainError('no_liquidity', 'no route', 422),
    );
    await expect(
      usecase.execute({ orderId: 'ord-1', slotKey: 'slot-0' }),
    ).rejects.toMatchObject({ code: 'no_liquidity' });
    const execution = await executions.findById('ord-1:slot-0');
    expect(execution?.status).toBe('claimed'); // resumable, not terminal
    expect(evaluate.execute).not.toHaveBeenCalled();

    // Redelivery after liquidity returns completes the same slot.
    dex.getQuote.mockResolvedValue(quote({ id: 'quote-2' }));
    const retry = await usecase.execute({
      orderId: 'ord-1',
      slotKey: 'slot-0',
    });
    expect(retry.status).toBe('submitted');
    expect(evaluate.execute).toHaveBeenCalledTimes(1);
  });

  describe('review fixes (OW-1, OW-2, M2)', () => {
    it('OW-1: kill switch flipped between decision and record fails the execution AFTER approval', async () => {
      evaluate.execute = jest.fn().mockImplementation(async () => {
        await killSwitch.setMode('pause_new', {
          actor: 'deck',
          reason: 'flip mid-flight',
          at: new Date(NOW).toISOString(),
        });
        return decision('approved');
      });
      const execution = await usecase.execute({
        orderId: 'ord-1',
        slotKey: 'slot-0',
      });
      expect(execution.status).toBe('failed');
      expect(execution.detail).toBe('kill_switch_active');
      // pause_new + D2: the order is NOT cancelled and must NOT be
      // stranded in 'triggered' (the scheduler only scans 'open', so a
      // triggered order would never resume after the switch lifts).
      // Revert to open; the post-gate re-check keeps re-execution safe.
      expect((await orders.findById('ord-1'))?.status).toBe('open');
    });

    it('OW-1: cancel_active flipped after approval fails the execution AND cancels the order', async () => {
      evaluate.execute = jest.fn().mockImplementation(async () => {
        await killSwitch.setMode('cancel_active', {
          actor: 'deck',
          reason: 'hard stop',
          at: new Date(NOW).toISOString(),
        });
        return decision('approved');
      });
      const execution = await usecase.execute({
        orderId: 'ord-1',
        slotKey: 'slot-0',
      });
      expect(execution.status).toBe('failed');
      expect(execution.detail).toBe('kill_switch_active');
      expect((await orders.findById('ord-1'))?.status).toBe('cancelled');
    });

    it('OW-1: order cancelled concurrently after approval is never marked submitted', async () => {
      evaluate.execute = jest.fn().mockImplementation(async () => {
        await orders.setStatus(
          'ord-1',
          'cancelled',
          new Date(NOW).toISOString(),
        );
        return decision('approved');
      });
      const execution = await usecase.execute({
        orderId: 'ord-1',
        slotKey: 'slot-0',
      });
      expect(execution.status).toBe('failed');
      expect(execution.detail).toBe('order_not_live:cancelled');
      expect((await orders.findById('ord-1'))?.status).toBe('cancelled');
    });

    it('OW-2: double-dispatching one slot approves EXACTLY ONE decision', async () => {
      const results = await Promise.allSettled([
        usecase.execute({ orderId: 'ord-1', slotKey: 'slot-0' }),
        usecase.execute({ orderId: 'ord-1', slotKey: 'slot-0' }),
      ]);
      const fulfilled = results.filter(
        (
          r,
        ): r is PromiseFulfilledResult<
          Awaited<ReturnType<ExecuteOrderSlotUseCase['execute']>>
        > => r.status === 'fulfilled',
      );
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(fulfilled[0].value.status).toBe('submitted');
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        code: 'duplicate_execution',
      });
      // The gate saw exactly ONE intent despite two concurrent dispatches.
      expect(evaluate.execute).toHaveBeenCalledTimes(1);
    });

    it('M2: limit order whose execution-time price violates the bound is rejected fail-closed, order stays OPEN', async () => {
      await orders.save({
        id: 'ord-limit',
        walletId: 'w-1',
        type: 'limit',
        status: 'open',
        chain: 'base',
        baseAsset: null,
        quoteAsset: USDC,
        side: 'buy',
        amount: '3000000000',
        limitPrice: '3000',
        interval: null,
        createdAt: new Date(NOW).toISOString(),
      });
      // Price moved UP through the trigger into execution — buying at
      // 3200 violates limit 3000.
      triggerPrice.getPrint.mockResolvedValue(print('3200'));
      const execution = await usecase.execute({
        orderId: 'ord-limit',
        slotKey: 'once',
      });
      expect(execution.status).toBe('failed');
      expect(execution.detail).toContain('limit_price_violation');
      expect(execution.detail).toContain('3200');
      // Fail-closed: the gate NEVER saw an intent, and the order stays
      // open (re-armable), not failed.
      expect(evaluate.execute).not.toHaveBeenCalled();
      expect((await orders.findById('ord-limit'))?.status).toBe('open');
    });

    it('M2: unknown or stale print at execution time rejects fail-closed', async () => {
      await orders.save({
        id: 'ord-limit',
        walletId: 'w-1',
        type: 'limit',
        status: 'open',
        chain: 'base',
        baseAsset: null,
        quoteAsset: USDC,
        side: 'sell',
        amount: '3000000000',
        limitPrice: '3000',
        interval: null,
        createdAt: new Date(NOW).toISOString(),
      });
      triggerPrice.getPrint.mockResolvedValue(null);
      const unknown = await usecase.execute({
        orderId: 'ord-limit',
        slotKey: 'once',
      });
      expect(unknown.status).toBe('failed');
      expect(unknown.detail).toContain('trigger_price_unknown');
      expect((await orders.findById('ord-limit'))?.status).toBe('open');

      // Stale print (beyond TRIGGER_MAX_AGE_MS) — same fail-closed path.
      triggerPrice.getPrint.mockResolvedValue(print('3000', NOW - 2_700_001));
      const stale = await usecase.execute({
        orderId: 'ord-limit',
        slotKey: 'once',
      });
      expect(stale.status).toBe('failed');
      expect(stale.detail).toContain('trigger_price_stale');
      expect((await orders.findById('ord-limit'))?.status).toBe('open');
      expect(evaluate.execute).not.toHaveBeenCalled();
    });

    it('M2 re-arm: after a limit rejection the one-shot is unspent — the next trigger executes', async () => {
      await orders.save({
        id: 'ord-limit',
        walletId: 'w-1',
        type: 'limit',
        status: 'open',
        chain: 'base',
        baseAsset: null,
        quoteAsset: USDC,
        side: 'buy',
        amount: '3000000000',
        limitPrice: '3000',
        interval: null,
        createdAt: new Date(NOW).toISOString(),
      });
      triggerPrice.getPrint.mockResolvedValueOnce(print('3200'));
      const rejected = await usecase.execute({
        orderId: 'ord-limit',
        slotKey: 'once',
      });
      expect(rejected.status).toBe('failed');

      // Price back through the limit: the deterministic slot re-arms.
      triggerPrice.getPrint.mockResolvedValueOnce(print('2900'));
      const execution = await usecase.execute({
        orderId: 'ord-limit',
        slotKey: 'once',
      });
      expect(execution.status).toBe('submitted');
      expect((await orders.findById('ord-limit'))?.status).toBe('filled');
      expect(evaluate.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('delta fixes (D2 resume, D4 config)', () => {
    it('D2: kill stop at claim time reverts a triggered (redelivered) order back to open', async () => {
      // Redelivery shape: a prior attempt already marked the order
      // 'triggered' before failing; now the kill switch is up.
      await orders.setStatus('ord-1', 'triggered', new Date(NOW).toISOString());
      await killSwitch.setMode('pause_new', {
        actor: 'deck',
        reason: 'up before redelivery',
        at: new Date(NOW).toISOString(),
      });
      const execution = await usecase.execute({
        orderId: 'ord-1',
        slotKey: 'slot-0',
      });
      expect(execution.status).toBe('failed');
      expect(execution.detail).toBe('kill_switch_active');
      expect((await orders.findById('ord-1'))?.status).toBe('open');
      expect(evaluate.execute).not.toHaveBeenCalled();
    });

    it('D2: kill stop at claim time leaves an open order open', async () => {
      await killSwitch.setMode('pause_new', {
        actor: 'deck',
        reason: 'up before claim',
        at: new Date(NOW).toISOString(),
      });
      const execution = await usecase.execute({
        orderId: 'ord-1',
        slotKey: 'slot-0',
      });
      expect(execution.status).toBe('failed');
      expect(execution.detail).toBe('kill_switch_active');
      expect((await orders.findById('ord-1'))?.status).toBe('open');
    });

    it('D2: a kill-stopped limit order does NOT spend the one-shot — it re-arms after the switch lifts', async () => {
      await orders.save({
        id: 'ord-limit',
        walletId: 'w-1',
        type: 'limit',
        status: 'open',
        chain: 'base',
        baseAsset: null,
        quoteAsset: USDC,
        side: 'buy',
        amount: '3000000000',
        limitPrice: '3000',
        interval: null,
        createdAt: new Date(NOW).toISOString(),
      });
      await killSwitch.setMode('pause_new', {
        actor: 'deck',
        reason: 'flip at trigger',
        at: new Date(NOW).toISOString(),
      });
      const stopped = await usecase.execute({
        orderId: 'ord-limit',
        slotKey: 'once',
      });
      expect(stopped.status).toBe('failed');
      expect(stopped.detail).toBe('kill_switch_active');
      expect((await orders.findById('ord-limit'))?.status).toBe('open');

      // Switch lifted: the deterministic slot re-arms (kill stop did
      // not spend the one-shot) and executes to completion.
      await killSwitch.setMode('off', {
        actor: 'deck',
        reason: 'lift',
        at: new Date(NOW + 1000).toISOString(),
      });
      const resumed = await usecase.execute({
        orderId: 'ord-limit',
        slotKey: 'once',
      });
      expect(resumed.status).toBe('submitted');
      expect((await orders.findById('ord-limit'))?.status).toBe('filled');
      expect(evaluate.execute).toHaveBeenCalledTimes(1);
    });

    it('D4: the execution-time staleness check honors the wired TriggerConfig', async () => {
      await orders.save({
        id: 'ord-limit',
        walletId: 'w-1',
        type: 'limit',
        status: 'open',
        chain: 'base',
        baseAsset: null,
        quoteAsset: USDC,
        side: 'sell',
        amount: '3000000000',
        limitPrice: '3000',
        interval: null,
        createdAt: new Date(NOW).toISOString(),
      });
      // 2 minutes old: fresh under the 45m frozen default, stale under
      // a 60s override — proving the injected config is consulted.
      triggerConfig.maxAgeMs = 60_000;
      triggerPrice.getPrint.mockResolvedValue(print('3000', NOW - 120_000));
      const execution = await usecase.execute({
        orderId: 'ord-limit',
        slotKey: 'once',
      });
      expect(execution.status).toBe('failed');
      expect(execution.detail).toContain('trigger_price_stale');
      expect((await orders.findById('ord-limit'))?.status).toBe('open');
      expect(evaluate.execute).not.toHaveBeenCalled();
    });
  });

  it('never touches a wallet that does not exist', async () => {
    await orders.save({
      id: 'ord-2',
      walletId: 'ghost-wallet',
      type: 'dca',
      status: 'open',
      chain: 'base',
      baseAsset: null,
      quoteAsset: USDC,
      side: 'buy',
      amount: '1000',
      limitPrice: null,
      interval: 'P1D',
      createdAt: new Date(NOW).toISOString(),
    });
    const execution = await usecase.execute({
      orderId: 'ord-2',
      slotKey: 'slot-0',
    });
    expect(execution.status).toBe('failed');
    expect(execution.detail).toBe('wallet_not_found');
  });
});
