import { describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import type { Order, OrderExecution } from '@kryptr/shared-types';
import { err, ok } from '@kryptr/shared-types';
import { useCreateOrder } from './useCreateOrder';
import {
  createStubOrdersSource,
  type NewOrderRequest,
  type OrdersSource,
} from '@/lib/orders';

function request(overrides: Partial<NewOrderRequest> = {}): NewOrderRequest {
  return {
    walletId: 'wallet-base-demo',
    type: 'limit',
    chain: 'base',
    baseAsset: null,
    quoteAsset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    side: 'buy',
    amount: '500000000000000000',
    limitPrice: '3000',
    interval: null,
    ...overrides,
  };
}

function mountComposable(source?: OrdersSource) {
  const scope = effectScope();
  const api = scope.run(() => useCreateOrder(source));
  if (!api) throw new Error('composable failed to mount');
  return { api, stop: () => scope.stop() };
}

describe('useCreateOrder (fail-closed creation)', () => {
  it('rejects stop/twap locally with order_type_unsupported, without touching the source', async () => {
    const createSpy = vi.fn();
    const source: OrdersSource = {
      list: async () => ok([]),
      health: async () =>
        ok({ component: 'order-worker', ok: true, checkedAt: '' }),
      create: createSpy as OrdersSource['create'],
      executions: async () =>
        err<OrderExecution[]>({ code: 'worker_unavailable', message: '' }),
    };
    const { api, stop } = mountComposable(source);

    for (const type of ['stop', 'twap'] as const) {
      const success = await api.create(request({ type, limitPrice: null }));
      expect(success).toBe(false);
      expect(api.error.value?.code).toBe('order_type_unsupported');
      expect(api.created.value).toBeNull();
    }
    expect(createSpy).not.toHaveBeenCalled();
    expect(api.submitting.value).toBe(false);
    stop();
  });

  it('surfaces the stub worker_unavailable envelope for supported types', async () => {
    const { api, stop } = mountComposable(createStubOrdersSource());

    const success = await api.create(request());

    expect(success).toBe(false);
    expect(api.error.value?.code).toBe('worker_unavailable');
    expect(api.created.value).toBeNull();
    stop();
  });

  it('records the created order when the source confirms', async () => {
    const created: Order = {
      ...request(),
      id: 'order-new',
      status: 'pending_approval',
      createdAt: '2026-08-16T00:00:00.000Z',
    };
    const source: OrdersSource = {
      list: async () => ok([]),
      health: async () =>
        ok({ component: 'order-worker', ok: true, checkedAt: '' }),
      create: async () => ok(created),
      executions: async () =>
        err<OrderExecution[]>({ code: 'worker_unavailable', message: '' }),
    };
    const { api, stop } = mountComposable(source);

    const success = await api.create(request());

    expect(success).toBe(true);
    expect(api.created.value?.id).toBe('order-new');
    expect(api.error.value).toBeNull();
    stop();
  });

  it('reset() clears a stale error', async () => {
    const { api, stop } = mountComposable(createStubOrdersSource());
    await api.create(request());
    expect(api.error.value).not.toBeNull();

    api.reset();

    expect(api.error.value).toBeNull();
    expect(api.created.value).toBeNull();
    stop();
  });
});
