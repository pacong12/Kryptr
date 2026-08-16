import {
  EXECUTION_STATUSES,
  KILL_SWITCH_MODES,
  ORDER_STATUSES,
  ORDER_TYPES,
} from '@kryptr/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MOCK_ORDERS } from '@/lib/fixtures';
import { humanize } from '@/lib/format';

import {
  ExecutionStatusBadge,
  KillSwitchModeBadge,
  OrderSideBadge,
  OrderStatusBadge,
  OrderTypeBadge,
} from './order-badges';
import { OrdersTable } from './orders-table';

/**
 * Wave-4 acceptance: badge coverage for ALL frozen status unions —
 * including paused / triggered / failed — plus the orders table contract.
 */

afterEach(cleanup);

describe('order badges', () => {
  it('renders a humanized badge for every frozen OrderStatus', () => {
    for (const status of ORDER_STATUSES) {
      render(<OrderStatusBadge status={status} />);
      expect(screen.getByText(humanize(status))).toBeInTheDocument();
      cleanup();
    }
  });

  it('renders a badge for every frozen OrderType', () => {
    for (const type of ORDER_TYPES) {
      render(<OrderTypeBadge type={type} />);
      expect(screen.getByText(type)).toBeInTheDocument();
      cleanup();
    }
  });

  it('renders a badge for every frozen KillSwitchMode', () => {
    for (const mode of KILL_SWITCH_MODES) {
      render(<KillSwitchModeBadge mode={mode} />);
      expect(screen.getByText(humanize(mode))).toBeInTheDocument();
      cleanup();
    }
  });

  it('renders a badge for every frozen ExecutionStatus', () => {
    for (const status of EXECUTION_STATUSES) {
      render(<ExecutionStatusBadge status={status} />);
      expect(screen.getByText(humanize(status))).toBeInTheDocument();
      cleanup();
    }
  });

  it('labels buy and sell sides', () => {
    render(<OrderSideBadge side="buy" />);
    render(<OrderSideBadge side="sell" />);
    expect(screen.getByText('buy')).toBeInTheDocument();
    expect(screen.getByText('sell')).toBeInTheDocument();
  });
});

describe('OrdersTable', () => {
  it('links every order id to its detail page and shows its status', () => {
    render(<OrdersTable orders={MOCK_ORDERS} />);
    for (const order of MOCK_ORDERS) {
      const link = screen.getByRole('link', { name: order.id });
      expect(link).toHaveAttribute('href', `/orders/${order.id}`);
      expect(screen.getByText(humanize(order.status))).toBeInTheDocument();
    }
  });

  it('shows limit price or interval fallback per order', () => {
    render(<OrdersTable orders={MOCK_ORDERS} />);
    // limit order with a price
    expect(screen.getAllByText(/3450\.00/).length).toBeGreaterThan(0);
    // DCA order without a limit price shows the interval instead
    expect(screen.getAllByText(/P1D/).length).toBeGreaterThan(0);
  });
});
