import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { OrderExecution } from '@kryptr/shared-types';
import OrderExecutionPanel from './OrderExecutionPanel.vue';

function execution(overrides: Partial<OrderExecution> = {}): OrderExecution {
  return {
    id: 'order-1:2026-08-17T00:00:00.000Z',
    orderId: 'order-1',
    slotKey: '2026-08-17T00:00:00.000Z',
    intentId: 'intent:order-1:2026-08-17T00:00:00.000Z',
    status: 'confirmed',
    claimedAt: '2026-08-17T00:00:00.000Z',
    finishedAt: '2026-08-17T00:00:05.000Z',
    detail: 'gate approved; unsigned execution ready (dry-run boundary)',
    ...overrides,
  };
}

const BASE_PROPS = {
  state: 'ready' as const,
  executions: [] as OrderExecution[],
  error: null,
};

describe('OrderExecutionPanel (honest ledger states)', () => {
  it('shows skeletons while the ledger loads', () => {
    const wrapper = mount(OrderExecutionPanel, {
      props: { ...BASE_PROPS, state: 'loading' },
    });
    expect(
      wrapper.find('[data-testid="order-executions-panel"]').exists(),
    ).toBe(true);
    expect(
      wrapper.findAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThanOrEqual(1);
    expect(wrapper.findAll('[data-execution-id]')).toHaveLength(0);
  });

  it('renders the typed error envelope, never a fabricated empty ledger', () => {
    const wrapper = mount(OrderExecutionPanel, {
      props: {
        ...BASE_PROPS,
        state: 'error',
        error: { code: 'order_not_found', message: 'gone' },
      },
    });
    const alert = wrapper.find('[data-testid="executions-load-error"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('Order not found');
    expect(alert.text()).toContain('order_not_found');
    expect(wrapper.text()).not.toContain('No executions claimed yet');
  });

  it('shows an honest empty state for an order with no claimed slots', () => {
    const wrapper = mount(OrderExecutionPanel, {
      props: { ...BASE_PROPS },
    });
    expect(wrapper.text()).toContain('No executions claimed yet');
    expect(wrapper.findAll('[data-execution-id]')).toHaveLength(0);
  });

  it('renders claimed slots with honest dry-run-boundary copy', () => {
    const wrapper = mount(OrderExecutionPanel, {
      props: {
        ...BASE_PROPS,
        executions: [
          execution(),
          execution({
            id: 'order-1:2026-08-16T00:00:00.000Z',
            slotKey: '2026-08-16T00:00:00.000Z',
            status: 'failed',
            finishedAt: null,
            detail: 'retry_exhausted (worker, not gate): timeout',
          }),
        ],
      },
    });

    expect(wrapper.text()).toContain('nothing is broadcast on-chain yet');
    const rows = wrapper.findAll('[data-execution-id]');
    expect(rows).toHaveLength(2);
    expect(wrapper.find('[data-execution-status="confirmed"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-execution-status="failed"]').exists()).toBe(
      true,
    );
    expect(wrapper.text()).toContain(
      'retry_exhausted (worker, not gate): timeout',
    );
    // No fabrication of timestamps the server did not send.
    expect(wrapper.text()).toContain('in flight');
  });
});
