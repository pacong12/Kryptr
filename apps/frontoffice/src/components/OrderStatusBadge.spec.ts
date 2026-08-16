import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { ORDER_STATUSES, type OrderStatus } from '@kryptr/shared-types';
import OrderStatusBadge from './OrderStatusBadge.vue';

const EXPECTED_LABELS: Record<OrderStatus, string> = {
  pending_approval: 'Pending approval',
  open: 'Open',
  paused: 'Paused',
  triggered: 'Triggered',
  partially_filled: 'Partially filled',
  filled: 'Filled',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  expired: 'Expired',
  failed: 'Failed',
};

describe('OrderStatusBadge (full frozen lifecycle)', () => {
  it('renders every frozen status with a human label', () => {
    // Parity guard: a new status in the freeze without a badge fails here.
    expect(Object.keys(EXPECTED_LABELS)).toHaveLength(ORDER_STATUSES.length);
    for (const status of ORDER_STATUSES) {
      const wrapper = mount(OrderStatusBadge, { props: { status } });
      expect(wrapper.text()).toBe(EXPECTED_LABELS[status]);
      expect(wrapper.find('[data-status]').attributes('data-status')).toBe(
        status,
      );
    }
  });

  it('marks failure terminal states destructive', () => {
    for (const status of ['rejected', 'failed'] as const) {
      const wrapper = mount(OrderStatusBadge, { props: { status } });
      expect(wrapper.html()).toContain('text-destructive');
    }
  });

  it('marks quiet terminal states outline', () => {
    for (const status of ['cancelled', 'expired'] as const) {
      const wrapper = mount(OrderStatusBadge, { props: { status } });
      expect(wrapper.html()).toContain('border-border');
    }
  });

  it('marks live states with the primary default style', () => {
    for (const status of ['open', 'triggered', 'partially_filled'] as const) {
      const wrapper = mount(OrderStatusBadge, { props: { status } });
      expect(wrapper.html()).toContain('bg-primary');
    }
  });
});
