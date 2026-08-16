import { describe, expect, it } from 'vitest';
import { effectScope } from 'vue';
import type { ApiEnvelope, OrderExecution } from '@kryptr/shared-types';
import { err, ok } from '@kryptr/shared-types';
import { useOrderExecutions } from './useOrderExecutions';
import type { OrdersSource } from '@/lib/orders';

function execution(overrides: Partial<OrderExecution> = {}): OrderExecution {
  return {
    id: 'order-1:once',
    orderId: 'order-1',
    slotKey: 'once',
    intentId: 'intent:order-1:once',
    status: 'confirmed',
    claimedAt: '2026-08-17T00:00:00.000Z',
    finishedAt: '2026-08-17T00:00:05.000Z',
    ...overrides,
  };
}

function executionsSource(
  executions: () => ReturnType<OrdersSource['executions']>,
): OrdersSource {
  return {
    list: async () => err({ code: 'worker_unavailable', message: '' }),
    health: async () => err({ code: 'worker_unavailable', message: '' }),
    create: async () => err({ code: 'worker_unavailable', message: '' }),
    executions,
  };
}

function mountComposable(source: OrdersSource) {
  const scope = effectScope();
  const api = scope.run(() => useOrderExecutions(source));
  if (!api) throw new Error('composable failed to mount');
  return { api, stop: () => scope.stop() };
}

describe('useOrderExecutions (on-demand ledger, fail-closed)', () => {
  it('loads the ledger of the expanded order', async () => {
    const { api, stop } = mountComposable(
      executionsSource(async () =>
        ok([execution(), execution({ id: 'order-1:P1D', slotKey: 'P1D' })]),
      ),
    );

    await api.load('order-1');

    expect(api.state.value).toBe('ready');
    expect(api.orderId.value).toBe('order-1');
    expect(api.executions.value).toHaveLength(2);
    stop();
  });

  it('surfaces error envelopes instead of fabricating an empty ledger', async () => {
    const { api, stop } = mountComposable(
      executionsSource(async () =>
        err({ code: 'order_not_found', message: 'gone' }),
      ),
    );

    await api.load('missing');

    expect(api.state.value).toBe('error');
    expect(api.executions.value).toEqual([]);
    expect(api.error.value?.code).toBe('order_not_found');
    stop();
  });

  it('reset() collapses the panel and discards superseded in-flight loads', async () => {
    let resolveLoad: (value: ApiEnvelope<OrderExecution[]>) => void = () => {};
    const pending = new Promise<ApiEnvelope<OrderExecution[]>>((resolve) => {
      resolveLoad = resolve;
    });
    const { api, stop } = mountComposable(executionsSource(() => pending));

    const inflight = api.load('order-1');
    api.reset();
    resolveLoad(ok([execution()]));
    await inflight;

    // The superseded load must not overwrite the collapsed state.
    expect(api.state.value).toBe('idle');
    expect(api.orderId.value).toBeNull();
    expect(api.executions.value).toEqual([]);
    stop();
  });
});
