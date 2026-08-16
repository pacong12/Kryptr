import type { Order } from '@kryptr/shared-types';
import { InMemoryOrderStore } from '../infrastructure/in-memory-order.store';
import { CancelOrderUseCase } from './cancel-order.usecase';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bfa02913' as const;

function order(overrides: Partial<Order>): Order {
  return {
    id: 'ord-1',
    walletId: 'w-1',
    type: 'limit',
    status: 'open',
    chain: 'base',
    baseAsset: null,
    quoteAsset: USDC,
    side: 'buy',
    amount: '1000',
    limitPrice: '3000',
    interval: null,
    createdAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

describe('CancelOrderUseCase', () => {
  let orders: InMemoryOrderStore;
  let usecase: CancelOrderUseCase;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW));
    orders = new InMemoryOrderStore();
    usecase = new CancelOrderUseCase(orders);
  });

  afterEach(() => jest.useRealTimers());

  it.each(['open', 'paused', 'triggered'] as const)(
    'cancels a %s order',
    async (status) => {
      await orders.save(order({ status }));
      const cancelled = await usecase.execute('ord-1');
      expect(cancelled.status).toBe('cancelled');
    },
  );

  it.each(['filled', 'cancelled', 'failed', 'expired'] as const)(
    'refuses a terminal %s order',
    async (status) => {
      await orders.save(order({ status }));
      await expect(usecase.execute('ord-1')).rejects.toMatchObject({
        code: 'order_not_live',
        httpStatus: 409,
      });
    },
  );

  it('order_not_found for unknown ids', async () => {
    await expect(usecase.execute('ghost')).rejects.toMatchObject({
      code: 'order_not_found',
      httpStatus: 404,
    });
  });
});
