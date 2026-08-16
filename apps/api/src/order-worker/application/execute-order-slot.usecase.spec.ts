import type { SecurityDecision, SwapQuote } from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import { InMemoryExecutionStore } from '../infrastructure/in-memory-execution.store';
import { InMemoryOrderStore } from '../infrastructure/in-memory-order.store';
import { InMemoryKillSwitch } from '../infrastructure/in-memory-kill-switch';
import { InMemoryWalletRepository } from '../../wallet/infrastructure/in-memory-wallet.repository';
import { InMemoryQuoteStore } from '../../trading/infrastructure/in-memory-quote-store';
import type { DexAggregatorPort } from '../../trading/domain/dex-aggregator.port';
import type { EvaluateIntentUseCase } from '../../security/application/evaluate-intent.usecase';
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
    evaluate = { execute: jest.fn().mockResolvedValue(decision('approved')) };
    usecase = new ExecuteOrderSlotUseCase(
      executions,
      killSwitch,
      orders,
      wallets,
      dex,
      quoteStore,
      evaluate as unknown as EvaluateIntentUseCase,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs the full ladder: claim → triggered → re-quote → gate → submitted + filled', async () => {
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
    // Order lifecycle: open → triggered → filled.
    expect((await orders.findById('ord-1'))?.status).toBe('filled');
  });

  it('exactly-once: a terminal slot rejects every later execution as duplicate', async () => {
    await usecase.execute({ orderId: 'ord-1', slotKey: 'slot-0' });
    await expect(
      usecase.execute({ orderId: 'ord-1', slotKey: 'slot-0' }),
    ).rejects.toMatchObject({ code: 'duplicate_execution' });
    // The gate saw exactly ONE intent for the slot.
    expect(evaluate.execute).toHaveBeenCalledTimes(1);
  });

  it('distinct slots of the same order each execute once (DCA rhythm)', async () => {
    await usecase.execute({ orderId: 'ord-1', slotKey: 'slot-0' });
    // Order became filled (terminal) — the next slot is order_not_live,
    // NOT a duplicate: slots are independent claims.
    const second = await usecase.execute({
      orderId: 'ord-1',
      slotKey: 'slot-1',
    });
    expect(second.status).toBe('failed');
    expect(second.detail).toContain('order_not_live');
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
