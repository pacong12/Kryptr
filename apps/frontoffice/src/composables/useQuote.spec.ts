import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import type { QuoteRequest, SwapQuote } from '@kryptr/shared-types';
import { useQuote } from './useQuote';

const WALLET_ID = 'wallet-base-demo';

function makeQuote(overrides: Partial<SwapQuote> = {}): SwapQuote {
  return {
    id: 'quote-1',
    source: 'static-mock',
    chain: 'base',
    assetIn: null,
    assetOut: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    amountIn: '500000000000000000',
    amountOut: '1500000000',
    price: 3000,
    minAmountOut: '1485000000',
    slippageBps: 100,
    route: [],
    fetchedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  };
}

const params: Omit<QuoteRequest, 'walletId'> = {
  chain: 'base',
  assetIn: null,
  assetOut: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  amount: '500000000000000000',
};

describe('useQuote (live quotes, fail closed)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function mountComposable() {
    const scope = effectScope();
    const api = scope.run(() => useQuote(WALLET_ID));
    if (!api) throw new Error('composable failed to mount');
    return { api, stop: () => scope.stop() };
  }

  it('requests a quote and exposes it with a live countdown', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) =>
      jsonResponse({ ok: true, data: makeQuote(), error: null }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { api, stop } = mountComposable();

    await api.refresh(params);

    expect(api.state.value).toBe('ready');
    expect(api.quote.value?.id).toBe('quote-1');
    expect(api.secondsLeft.value).toBe(30);
    const call = fetchMock.mock.calls[0];
    expect(String(call[0])).toContain('/quotes');
    stop();
  });

  it('flips to expired when the quote lapses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ ok: true, data: makeQuote(), error: null }),
      ),
    );
    const { api, stop } = mountComposable();

    await api.refresh(params);
    expect(api.state.value).toBe('ready');

    vi.advanceTimersByTime(31_000);

    expect(api.secondsLeft.value).toBe(0);
    expect(api.state.value).toBe('expired');
    stop();
  });

  it('surfaces an error envelope as the error state (never mocks quotes)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            ok: false,
            data: null,
            error: {
              code: 'aggregator_unavailable',
              message: 'No aggregator could price this pair.',
            },
          },
          false,
          502,
        ),
      ),
    );
    const { api, stop } = mountComposable();

    await api.refresh(params);

    expect(api.state.value).toBe('error');
    expect(api.quote.value).toBeNull();
    expect(api.error.value?.code).toBe('aggregator_unavailable');
    stop();
  });

  it('fails closed when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    const { api, stop } = mountComposable();

    await api.refresh(params);

    expect(api.state.value).toBe('error');
    expect(api.quote.value).toBeNull();
    expect(api.error.value?.code).toBe('network_error');
    stop();
  });

  it('clear() returns to idle and drops the quote', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ ok: true, data: makeQuote(), error: null }),
      ),
    );
    const { api, stop } = mountComposable();

    await api.refresh(params);
    expect(api.state.value).toBe('ready');

    api.clear();

    expect(api.state.value).toBe('idle');
    expect(api.quote.value).toBeNull();
    stop();
  });
});
