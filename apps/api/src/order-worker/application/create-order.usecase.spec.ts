import type { OrderType } from '@kryptr/shared-types';
import { InMemoryOrderStore } from '../infrastructure/in-memory-order.store';
import { InMemoryKillSwitch } from '../infrastructure/in-memory-kill-switch';
import { CreateOrderUseCase } from './create-order.usecase';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bfa02913' as const;

describe('CreateOrderUseCase', () => {
  let orders: InMemoryOrderStore;
  let killSwitch: InMemoryKillSwitch;
  let usecase: CreateOrderUseCase;

  const input = (overrides: Record<string, unknown> = {}) => ({
    id: 'ord-1',
    walletId: 'w-1',
    type: 'limit' as OrderType,
    chain: 'base' as const,
    baseAsset: null,
    quoteAsset: USDC,
    side: 'buy' as const,
    amount: '1000000',
    limitPrice: '3000',
    interval: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW));
    orders = new InMemoryOrderStore();
    killSwitch = new InMemoryKillSwitch();
    usecase = new CreateOrderUseCase(orders, killSwitch);
  });

  afterEach(() => jest.useRealTimers());

  it('creates a limit order open and stamped', async () => {
    const order = await usecase.execute(input());
    expect(order.status).toBe('open');
    expect(order.createdAt).toBe(new Date(NOW).toISOString());
    expect(await orders.findById('ord-1')).toMatchObject({ type: 'limit' });
  });

  it('creates a dca order with a valid ISO interval', async () => {
    const order = await usecase.execute(
      input({ type: 'dca', limitPrice: null, interval: 'P1D' }),
    );
    expect(order.status).toBe('open');
    expect(order.interval).toBe('P1D');
  });

  it.each(['stop', 'twap'] as const)(
    'rejects %s explicitly (never silently accepted)',
    async (type) => {
      await expect(usecase.execute(input({ type }))).rejects.toMatchObject({
        code: 'order_type_unsupported',
        httpStatus: 422,
      });
      expect(await orders.findAll()).toEqual([]);
    },
  );

  it('rejects creation entirely while the kill switch is active', async () => {
    await killSwitch.setMode('pause_new', {
      actor: 'deck',
      reason: 'halt',
      at: new Date(NOW).toISOString(),
    });
    await expect(usecase.execute(input())).rejects.toMatchObject({
      code: 'kill_switch_active',
      httpStatus: 403,
    });
  });

  it.each([
    ['zero amount', { amount: '0' }],
    ['non-numeric amount', { amount: 'abc' }],
    ['negative amount', { amount: '-5' }],
    ['limit without price', { limitPrice: null }],
    ['limit with zero price', { limitPrice: '0' }],
  ])('rejects %s', async (_label, overrides) => {
    await expect(usecase.execute(input(overrides))).rejects.toMatchObject({
      code: 'order_type_unsupported',
    });
  });

  it.each([
    ['dca without interval', { type: 'dca', limitPrice: null, interval: null }],
    ['dca with invalid interval', { type: 'dca', limitPrice: null, interval: 'P1Y' }],
  ])('rejects %s', async (_label, overrides) => {
    await expect(usecase.execute(input(overrides))).rejects.toMatchObject({
      code: 'order_type_unsupported',
    });
  });
});
