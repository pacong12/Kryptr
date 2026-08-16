import { describe, expect, it } from 'vitest';
import { effectScope } from 'vue';
import type {
  ApiEnvelope,
  Order,
  OrderExecution,
  WorkerHealth,
} from '@kryptr/shared-types';
import { ok, err } from '@kryptr/shared-types';
import { useOrders } from './useOrders';
import { createStubOrdersSource, type OrdersSource } from '@/lib/orders';

const WALLET_ID = 'wallet-base-demo';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    walletId: WALLET_ID,
    type: 'limit',
    status: 'open',
    chain: 'base',
    baseAsset: null,
    quoteAsset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    side: 'buy',
    amount: '500000000000000000',
    limitPrice: '3000',
    interval: null,
    createdAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  };
}

function makeHealth(overrides: Partial<WorkerHealth> = {}): WorkerHealth {
  return {
    component: 'order-worker',
    ok: true,
    checkedAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  };
}

/** Build a source from per-call envelopes for deterministic scenarios. */
function sourceFrom(options: {
  list?: ApiEnvelope<Order[]>;
  health?: ApiEnvelope<WorkerHealth>;
}): OrdersSource {
  return {
    list: async () =>
      options.list ?? err<Order[]>({ code: 'worker_unavailable', message: '' }),
    health: async () => options.health ?? ok(makeHealth()),
    create: async () =>
      err<Order>({ code: 'worker_unavailable', message: 'not used' }),
    executions: async () =>
      err<OrderExecution[]>({ code: 'worker_unavailable', message: '' }),
  };
}

function mountComposable(source?: OrdersSource) {
  const scope = effectScope();
  const api = scope.run(() => useOrders(WALLET_ID, source));
  if (!api) throw new Error('composable failed to mount');
  return { api, stop: () => scope.stop() };
}

describe('useOrders (worker-down degradation, no fabrication)', () => {
  it('fails closed with the stub source: error state, worker down, zero orders', async () => {
    const { api, stop } = mountComposable(createStubOrdersSource());

    await api.refresh();

    expect(api.state.value).toBe('error');
    expect(api.orders.value).toEqual([]);
    expect(api.error.value?.code).toBe('worker_unavailable');
    expect(api.workerDown.value).toBe(true);
    expect(api.workerHealth.value?.ok).toBe(false);
    stop();
  });

  it('renders loaded orders when the source answers', async () => {
    const orders = [
      makeOrder(),
      makeOrder({ id: 'order-2', status: 'filled' }),
    ];
    const { api, stop } = mountComposable(
      sourceFrom({ list: ok(orders), health: ok(makeHealth()) }),
    );

    await api.refresh();

    expect(api.state.value).toBe('ready');
    expect(api.orders.value).toHaveLength(2);
    expect(api.workerDown.value).toBe(false);
    stop();
  });

  it('keeps orders visible but flags staleness when the worker is down', async () => {
    const orders = [makeOrder()];
    const { api, stop } = mountComposable(
      sourceFrom({
        list: ok(orders),
        health: ok(makeHealth({ ok: false, detail: 'redis_unreachable' })),
      }),
    );

    await api.refresh();

    expect(api.state.value).toBe('ready');
    expect(api.orders.value).toHaveLength(1);
    expect(api.workerDown.value).toBe(true);
    expect(api.workerHealth.value?.detail).toBe('redis_unreachable');
    stop();
  });

  it('keeps the last health card when the health endpoint itself is unreachable', async () => {
    const source = sourceFrom({
      list: ok([makeOrder()]),
      health: ok(makeHealth({ ok: false })),
    });
    const { api, stop } = mountComposable(source);
    await api.refresh();
    expect(api.workerDown.value).toBe(true);

    // Second refresh: health endpoint now errors → card is kept, not guessed.
    source.health = async () =>
      err<WorkerHealth>({ code: 'network_error', message: '' });
    await api.refresh();

    expect(api.workerDown.value).toBe(true);
    expect(api.workerHealth.value?.ok).toBe(false);
    stop();
  });
});
