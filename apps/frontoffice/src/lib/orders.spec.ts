import { describe, expect, it } from 'vitest';
import { createStubOrdersSource, isSupportedOrderType } from './orders';

const CHECKED_AT = '2026-08-16T12:00:00.000Z';

describe('wave-4 order source contract', () => {
  it('supports limit and dca, rejects stop and twap', () => {
    expect(isSupportedOrderType('limit')).toBe(true);
    expect(isSupportedOrderType('dca')).toBe(true);
    expect(isSupportedOrderType('stop')).toBe(false);
    expect(isSupportedOrderType('twap')).toBe(false);
  });

  describe('stub source (fail-closed until the API contract lands)', () => {
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
  });
});
