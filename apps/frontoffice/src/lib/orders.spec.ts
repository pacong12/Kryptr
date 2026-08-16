import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnvelope, Order } from '@kryptr/shared-types';
import { err, ok } from '@kryptr/shared-types';
import { API_PREFIX, API_URL } from './api';
import {
  createApiOrdersSource,
  createStubOrdersSource,
  isSupportedOrderType,
} from './orders';

const CHECKED_AT = '2026-08-16T12:00:00.000Z';
const API_BASE = `${API_URL}${API_PREFIX}`;

function apiEnvelope<T>(envelope: ApiEnvelope<T>): Response {
  return new Response(JSON.stringify(envelope), {
    status: envelope.ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetchOnce(response: Response): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    walletId: 'wallet-1',
    type: 'limit',
    chain: 'base',
    baseAsset: null,
    quoteAsset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    side: 'buy',
    amount: '1000000',
    limitPrice: '3000',
    interval: null,
    status: 'open',
    createdAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('wave-4 order source contract', () => {
  it('supports limit and dca, rejects stop and twap', () => {
    expect(isSupportedOrderType('limit')).toBe(true);
    expect(isSupportedOrderType('dca')).toBe(true);
    expect(isSupportedOrderType('stop')).toBe(false);
    expect(isSupportedOrderType('twap')).toBe(false);
  });

  describe('stub source (pre-rewire fail-closed posture, kept for tests)', () => {
    const source = createStubOrdersSource(() => CHECKED_AT);

    it('never fabricates orders: list resolves to a worker_unavailable envelope', async () => {
      const result = await source.list('wallet-1');
      expect(result.ok).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('worker_unavailable');
    });

    it('reports worker health as down with a checkedAt stamp', async () => {
      const result = await source.health();
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({
        component: 'order-worker',
        ok: false,
        detail: 'worker_unavailable',
        checkedAt: CHECKED_AT,
      });
    });

    it('rejects stop/twap creation with the frozen order_type_unsupported code', async () => {
      for (const type of ['stop', 'twap'] as const) {
        const result = await source.create({
          walletId: 'wallet-1',
          type,
          chain: 'base',
          baseAsset: null,
          quoteAsset: null,
          side: 'buy',
          amount: '1',
          limitPrice: null,
          interval: null,
        });
        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('order_type_unsupported');
      }
    });

    it('rejects supported-type creation with worker_unavailable (never fakes an order)', async () => {
      const result = await source.create({
        walletId: 'wallet-1',
        type: 'limit',
        chain: 'base',
        baseAsset: null,
        quoteAsset: null,
        side: 'buy',
        amount: '1',
        limitPrice: '3000',
        interval: null,
      });
      expect(result.ok).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('worker_unavailable');
    });

    it('never fabricates executions: worker_unavailable envelope', async () => {
      const result = await source.executions('order-1');
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('worker_unavailable');
    });
  });

  describe('API source (wave-4 rewire, real worker endpoints)', () => {
    const source = createApiOrdersSource();

    it('scopes the all-wallets list endpoint to the requested wallet', async () => {
      mockFetchOnce(
        apiEnvelope(ok([order(), order({ id: 'order-2', walletId: 'other' })])),
      );

      const result = await source.list('wallet-1');

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/orders`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result.ok).toBe(true);
      expect(result.data?.map((entry) => entry.id)).toEqual(['order-1']);
    });

    it('passes list error envelopes through untouched (no empty-list coercion)', async () => {
      mockFetchOnce(
        apiEnvelope(
          err<Order[]>({ code: 'worker_unavailable', message: 'down' }),
        ),
      );

      const result = await source.list('wallet-1');

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('worker_unavailable');
    });

    it('reads the worker health card from /health/worker', async () => {
      mockFetchOnce(
        apiEnvelope(
          ok({
            component: 'order-worker',
            ok: false,
            detail: 'worker_unavailable',
            checkedAt: CHECKED_AT,
          }),
        ),
      );

      const result = await source.health();

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/health/worker`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result.ok).toBe(true);
      expect(result.data?.ok).toBe(false);
    });

    it('creates orders via POST /orders and returns the frozen Order', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(apiEnvelope(ok(order({ id: 'order-new' }))));

      const result = await source.create({
        walletId: 'wallet-1',
        type: 'dca',
        chain: 'base',
        baseAsset: null,
        quoteAsset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        side: 'buy',
        amount: '3000000000',
        limitPrice: null,
        interval: 'P1D',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        `${API_BASE}/orders`,
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.ok).toBe(true);
      expect(result.data?.id).toBe('order-new');
    });

    it('reads the executions ledger from /orders/:id/executions', async () => {
      mockFetchOnce(apiEnvelope(ok([])));

      const result = await source.executions('order-1');

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/orders/order-1/executions`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result.ok).toBe(true);
      expect(result.data).toEqual([]);
    });
  });
});
