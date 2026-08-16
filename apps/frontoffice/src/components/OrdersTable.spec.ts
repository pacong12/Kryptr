import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { Order, WalletBalance } from '@kryptr/shared-types';
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

const BASE_PROPS = {
  balances: [] as WalletBalance[],
  expandedOrderId: null as string | null,
  executionsState: 'idle' as const,
  executions: [],
  executionsError: null,
};

describe('OrdersTable (lifecycle list)', () => {
  it('renders one row per order with status badges', () => {
    const wrapper = mount(OrdersTable, {
      props: {
        ...BASE_PROPS,
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

  it('formats amounts side-aware: sell in base units, buy in quote units (#52 + F1)', () => {
    const wrapper = mount(OrdersTable, {
      props: {
        ...BASE_PROPS,
        orders: [
          // SELL: amount is BASE-denominated (USDC here).
          makeOrder({
            id: 'order-sell',
            baseAsset: USDC,
            quoteAsset: null,
            side: 'sell',
            amount: '3000000000',
          }),
          // BUY: amount is QUOTE-denominated (USDC here), per the worker
          // contract — never the base asset's decimals.
          makeOrder({
            id: 'order-buy',
            baseAsset: null,
            quoteAsset: USDC,
            side: 'buy',
            amount: '1500000000',
          }),
        ],
        balances: [
          {
            walletId: 'wallet-base-demo',
            chain: 'base',
            nativeBalance: '0',
            tokens: [
              {
                contractAddress: USDC,
                symbol: 'USDC',
                decimals: 6,
                amount: '3000000000',
              },
            ],
          },
        ],
        workerDown: false,
      },
    });

    expect(wrapper.text()).toContain('3000 USDC');
    expect(wrapper.text()).toContain('1500 USDC');
    // Neither amount renders through the wrong (native 18-dp) metadata.
    expect(wrapper.text()).not.toContain('ETH');
    expect(wrapper.text()).not.toContain('3000000000');
    expect(wrapper.text()).not.toContain('1500000000');
  });

  it('falls back to the raw amount when the asset metadata is unknown', () => {
    const wrapper = mount(OrdersTable, {
      props: {
        ...BASE_PROPS,
        orders: [
          makeOrder({
            side: 'sell',
            baseAsset: '0x000000000000000000000000000000000000dEaD',
          }),
        ],
        workerDown: false,
      },
    });

    // SELL denominates in the base asset; unknown token, no balances loaded
    // — raw units render, never invented decimals.
    expect(wrapper.text()).toContain('500000000000000000');
  });

  it('shows an honest empty state — no fabricated rows', () => {
    const wrapper = mount(OrdersTable, {
      props: { ...BASE_PROPS, orders: [], workerDown: false },
    });
    expect(wrapper.text()).toContain('No orders yet');
    expect(wrapper.findAll('[data-order-id]')).toHaveLength(0);
    expect(wrapper.find('table').exists()).toBe(false);
  });

  it('flags statuses as potentially stale while the worker is down', () => {
    const wrapper = mount(OrdersTable, {
      props: { ...BASE_PROPS, orders: [makeOrder()], workerDown: true },
    });
    const note = wrapper.find('[data-testid="orders-stale-note"]');
    expect(note.exists()).toBe(true);
    expect(note.text()).toContain('may be stale');
    // Orders remain visible despite the degradation.
    expect(wrapper.findAll('[data-order-id]')).toHaveLength(1);
  });

  it('emits toggle-executions with the order id', async () => {
    const wrapper = mount(OrdersTable, {
      props: { ...BASE_PROPS, orders: [makeOrder()], workerDown: false },
    });

    await wrapper
      .find('button[aria-label^="Show executions"]')
      .trigger('click');

    expect(wrapper.emitted('toggle-executions')).toEqual([['order-1']]);
  });

  it('renders the executions panel only for the expanded order', () => {
    const wrapper = mount(OrdersTable, {
      props: {
        ...BASE_PROPS,
        orders: [makeOrder(), makeOrder({ id: 'order-2' })],
        expandedOrderId: 'order-1',
        executionsState: 'ready',
        workerDown: false,
      },
    });

    expect(wrapper.find('[data-executions-row="order-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-executions-row="order-2"]').exists()).toBe(
      false,
    );
    expect(
      wrapper.find('[data-testid="order-executions-panel"]').exists(),
    ).toBe(true);
  });
});
