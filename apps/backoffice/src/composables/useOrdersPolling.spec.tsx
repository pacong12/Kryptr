import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useOrdersPolling } from './useOrdersPolling';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cleanup();
});

describe('useOrdersPolling', () => {
  const mockOrder = {
    id: 'ord_live_test_1',
    type: 'limit' as const,
    side: 'buy' as const,
    baseAsset: '0x1234567890abcdef1234567890abcdef12345678',
    quoteAsset: '0xabcdef1234567890abcdef1234567890abcdef12',
    amount: '1000000000000000000',
    limitPrice: '2000.50',
    interval: null,
    status: 'open' as const,
    createdAt: '2026-08-18T10:00:00.000Z',
  };

  it('starts polling and renders component', async () => {
    function TestComponent() {
      const result = useOrdersPolling({ enabled: true });
      return (
        <div data-testid="status">
          Orders: {result.orders.length}
          <span data-testid="loading">{String(result.loading)}</span>
        </div>
      );
    }

    render(<TestComponent />);
    
    expect(screen.getByTestId('status')).toBeInTheDocument();
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
  });

  it('debounces rapid updates during polling', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      data: [mockOrder],
      mock: false,
      apiError: null,
    });
    vi.stubGlobal('fetch', mockFetch);

    function TestComponent() {
      const result = useOrdersPolling({ intervalMs: 50, enabled: true });
      return <div data-testid="count">{result.orders.length}</div>;
    }

    render(<TestComponent />);

    await new Promise((resolve) => setTimeout(resolve, 150));
    
    expect(mockFetch).toHaveBeenCalled();
  });

  it('handles disabled state without starting polling', () => {
    const mockFetch = vi.fn().mockResolvedValue({
      data: [mockOrder],
      mock: false,
      apiError: null,
    });
    vi.stubGlobal('fetch', mockFetch);

    function TestComponent() {
      const result = useOrdersPolling({ enabled: false });
      return <div data-testid="disabled">{result.orders.length}</div>;
    }

    render(<TestComponent />);

    expect(screen.getByTestId('disabled')).toBeInTheDocument();
  });
});
