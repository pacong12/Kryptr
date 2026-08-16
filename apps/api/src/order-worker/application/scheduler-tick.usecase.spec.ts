import type { Order } from '@kryptr/shared-types';
import type { JobQueuePort } from '../domain/job-queue.port';
import { InMemoryOrderStore } from '../infrastructure/in-memory-order.store';
import { InMemoryExecutionStore } from '../infrastructure/in-memory-execution.store';
import { InMemoryKillSwitch } from '../infrastructure/in-memory-kill-switch';
import { StaticTriggerPrice } from '../infrastructure/static-trigger-price';
import { SchedulerTickUseCase } from './scheduler-tick.usecase';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bfa02913' as const;

function order(overrides: Partial<Order>): Order {
  return {
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
    ...overrides,
  };
}

describe('SchedulerTickUseCase', () => {
  let orders: InMemoryOrderStore;
  let executions: InMemoryExecutionStore;
  let killSwitch: InMemoryKillSwitch;
  let enqueued: Array<{ orderId: string; slotKey: string }>;
  let queue: JobQueuePort;
  let usecase: SchedulerTickUseCase;

  function build(
    primary: StaticTriggerPrice,
    hint: StaticTriggerPrice,
  ): void {
    usecase = new SchedulerTickUseCase(
      orders,
      executions,
      primary,
      hint,
      killSwitch,
      queue,
    );
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW));
    orders = new InMemoryOrderStore();
    executions = new InMemoryExecutionStore();
    killSwitch = new InMemoryKillSwitch();
    enqueued = [];
    queue = {
      enqueueExecution: async (orderId, slotKey) => {
        enqueued.push({ orderId, slotKey });
        return { jobId: `${orderId}.${slotKey}`, deduplicated: false };
      },
      pauseExecutions: async () => undefined,
      resumeExecutions: async () => undefined,
      health: async (nowIso) => ({
        component: 'order-worker' as const,
        ok: true,
        checkedAt: nowIso,
      }),
    };
    build(new StaticTriggerPrice({ priceUsd: '3000' }), new StaticTriggerPrice({ priceUsd: '3000' }));
  });

  afterEach(() => jest.useRealTimers());

  it('enqueues the CURRENT dca slot exactly once per slot', async () => {
    await orders.save(order({}));
    const evaluations = await usecase.execute();

    expect(enqueued).toEqual([
      { orderId: 'ord-1', slotKey: '2026-05-01T12:00:00.000Z' },
    ]);
    expect(evaluations[0].outcome).toBe('triggered');
    // The claim was created by the execution, not the scheduler; the
    // scheduler's own guard is the execution-store lookup.
    await executions.claim('ord-1', '2026-05-01T12:00:00.000Z', new Date(NOW).toISOString());
    enqueued.length = 0;
    await usecase.execute();
    expect(enqueued).toEqual([]);
  });

  it('a kill switch in ANY mode makes the tick a no-op (fail-closed)', async () => {
    await orders.save(order({}));
    await killSwitch.setMode('pause_new', {
      actor: 'deck',
      reason: 'halt',
      at: new Date(NOW).toISOString(),
    });
    const evaluations = await usecase.execute();
    expect(evaluations).toEqual([]);
    expect(enqueued).toEqual([]);
  });

  it('fires a limit order when both prints cross the limit', async () => {
    await orders.save(
      order({ type: 'limit', interval: null, limitPrice: '3000', side: 'buy' }),
    );
    build(
      new StaticTriggerPrice({ priceUsd: '2990' }),
      new StaticTriggerPrice({ priceUsd: '2991' }),
    );
    const evaluations = await usecase.execute();
    expect(evaluations[0].outcome).toBe('triggered');
    expect(enqueued).toEqual([{ orderId: 'ord-1', slotKey: 'once' }]);
  });

  it('suppresses a limit one-shot once any execution exists', async () => {
    await orders.save(
      order({ type: 'limit', interval: null, limitPrice: '3000', side: 'buy' }),
    );
    build(
      new StaticTriggerPrice({ priceUsd: '2990' }),
      new StaticTriggerPrice({ priceUsd: '2991' }),
    );
    await executions.claim('ord-1', 'once', new Date(NOW).toISOString());
    const evaluations = await usecase.execute();
    expect(evaluations[0].outcome).toBe('armed');
    expect(evaluations[0].detail).toContain('one-shot');
    expect(enqueued).toEqual([]);
  });

  it('unknown trigger price never enqueues (needs_human_approval, order stays open)', async () => {
    await orders.save(
      order({ type: 'limit', interval: null, limitPrice: '3000' }),
    );
    build(
      new StaticTriggerPrice({ print: null }),
      new StaticTriggerPrice({ priceUsd: '3000' }),
    );
    const evaluations = await usecase.execute();
    expect(evaluations[0].outcome).toBe('needs_human_approval');
    expect(enqueued).toEqual([]);
    expect((await orders.findById('ord-1'))?.status).toBe('open');
  });

  it('ignores non-open orders and unsupported types defensively', async () => {
    await orders.save(order({ id: 'ord-c', status: 'cancelled' }));
    await orders.save(order({ id: 'ord-t', type: 'twap', interval: 'PT1H' }));
    const evaluations = await usecase.execute();
    expect(evaluations).toEqual([]);
    expect(enqueued).toEqual([]);
  });

  it('missed dca slots are not retro-enqueued (no catch-up)', async () => {
    // Created 3 days ago; only the CURRENT slot is eligible.
    await orders.save(
      order({ createdAt: new Date(NOW - 3 * 86_400_000).toISOString() }),
    );
    await usecase.execute();
    expect(enqueued).toEqual([
      { orderId: 'ord-1', slotKey: '2026-05-01T12:00:00.000Z' },
    ]);
  });
});
