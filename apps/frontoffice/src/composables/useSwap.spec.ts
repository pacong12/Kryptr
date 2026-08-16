import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import type { SwapQuote } from '@kryptr/shared-types';
import { buildSwapIntent, useSwap } from './useSwap';

const WALLET_ID = 'wallet-base-demo';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const quote: SwapQuote = {
  id: 'quote-1',
  source: 'static-mock',
  chain: 'base',
  assetIn: null,
  assetOut: USDC,
  amountIn: '500000000000000000',
  amountOut: '1500000000',
  price: 3000,
  minAmountOut: '1485000000',
  slippageBps: 100,
  route: [],
  fetchedAt: '2026-08-16T00:00:00.000Z',
  expiresAt: '2026-08-16T00:00:30.000Z',
};

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
}

describe('buildSwapIntent', () => {
  it('binds the intent to the quote via the swap context', () => {
    const intent = buildSwapIntent(WALLET_ID, 'base', quote);

    expect(intent.kind).toBe('swap');
    expect(intent.walletId).toBe(WALLET_ID);
    expect(intent.to).toBeNull();
    expect(intent.asset).toBeNull();
    expect(intent.amount).toBe(quote.amountIn);
    expect(intent.origin).toBe('user');
    expect(intent.swap).toEqual({
      quoteId: 'quote-1',
      buyAsset: USDC,
      minBuyAmount: quote.minAmountOut,
      maxSlippageBps: quote.slippageBps,
      quoteExpiresAt: quote.expiresAt,
    });
  });
});

describe('useSwap (gate decision, no signing)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mountComposable() {
    const scope = effectScope();
    const api = scope.run(() => useSwap());
    if (!api) throw new Error('composable failed to mount');
    return { api, stop: () => scope.stop() };
  }

  it('evaluates the bound intent and exposes the decision', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init: RequestInit) =>
        jsonResponse({
          ok: true,
          data: {
            intentId: 'intent-1',
            result: 'approved',
            reason: 'approved: within policy',
            decidedAt: '2026-08-16T00:00:01.000Z',
          },
          error: null,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { api, stop } = mountComposable();

    await api.evaluate(WALLET_ID, 'base', quote);

    expect(api.result.value).toBe('approved');
    expect(api.decision.value?.intentId).toBe('intent-1');
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.kind).toBe('swap');
    expect(body.swap.quoteId).toBe('quote-1');
    expect(body.swap.minBuyAmount).toBe(quote.minAmountOut);
    stop();
  });

  it('surfaces an unsigned calldata preview when the gate returns one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          ok: true,
          data: {
            intentId: 'intent-2',
            result: 'approved',
            reason: 'approved: within policy',
            decidedAt: '2026-08-16T00:00:01.000Z',
            preview: '0xdeadbeef',
          },
          error: null,
        }),
      ),
    );
    const { api, stop } = mountComposable();

    await api.evaluate(WALLET_ID, 'base', quote);

    expect(api.preview.value).toBe('0xdeadbeef');
    stop();
  });

  it('blocks when the security gate is unreachable (never bypassed)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    const { api, stop } = mountComposable();

    await api.evaluate(WALLET_ID, 'base', quote);

    expect(api.gateUnreachable.value).toBe(true);
    expect(api.decision.value).toBeNull();
    expect(api.result.value).toBeNull();
    stop();
  });
});
