import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { Order } from '@kryptr/shared-types';
import OrdersTable from './OrdersTable.vue';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    walletId: 'wallet-base-demo',
    type: 'limit',
    status: 'open',
    chain: 'base',
    baseAsset: null,
    quoteAsset: USDC,
    side: 'buy',
    amount: '500000000000000000',
    limitPrice: '3000',
    interval: null,
    createdAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  };
}

describe('OrdersTable (lifecycle list)', () => {
  it('renders one row per order with status badges', () => {
    const wrapper = mount(OrdersTable, {
      props: {
        orders: [
          makeOrder(),
          makeOrder({
            id: 'order-2',
            type: 'dca',
            status: 'partially_filled',
            limitPrice: null,
            interval: 'P1D',
          }),
          makeOrder({ id: 'order-3', status: 'failed' }),
        ],
        workerDown: false,
      },
    });

    expect(wrapper.findAll('[data-order-id]')).toHaveLength(3);
    expect(wrapper.text()).toContain('@ 3000');
    expect(wrapper.text()).toContain('every P1D');
    expect(wrapper.find('[data-status="open"]').exists()).toBe(true);
    expect(wrapper.find('[data-status="partially_filled"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-status="failed"]').exists()).toBe(true);
    // No stale note while the worker is healthy.
    expect(wrapper.find('[data-testid="orders-stale-note"]').exists()).toBe(
      false,
    );
  });

  it('shows an honest empty state — no fabricated rows', () => {
    const wrapper = mount(OrdersTable, {
      props: { orders: [], workerDown: false },
    });
    expect(wrapper.text()).toContain('No orders yet');
    expect(wrapper.findAll('[data-order-id]')).toHaveLength(0);
    expect(wrapper.find('table').exists()).toBe(false);
  });

  it('flags statuses as potentially stale while the worker is down', () => {
    const wrapper = mount(OrdersTable, {
      props: { orders: [makeOrder()], workerDown: true },
    });
    const note = wrapper.find('[data-testid="orders-stale-note"]');
    expect(note.exists()).toBe(true);
    expect(note.text()).toContain('may be stale');
    // Orders remain visible despite the degradation.
    expect(wrapper.findAll('[data-order-id]')).toHaveLength(1);
  });
});
