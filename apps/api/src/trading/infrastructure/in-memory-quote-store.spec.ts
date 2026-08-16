import type { SwapQuote } from '@kryptr/shared-types';
import { InMemoryQuoteStore } from './in-memory-quote-store';

const QUOTE: SwapQuote = {
  id: 'quote-1',
  source: 'static-mock',
  chain: 'base',
  assetIn: null,
  assetOut: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  amountIn: '1000',
  amountOut: '3000000',
  price: 3000,
  minAmountOut: '2985000',
  slippageBps: 50,
  route: [
    {
      venue: 'static-mock',
      assetIn: null,
      assetOut: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    },
  ],
  fetchedAt: '2026-05-01T00:00:00.000Z',
  expiresAt: '2026-05-01T00:01:00.000Z',
};

describe('InMemoryQuoteStore', () => {
  it('saves and finds quotes, unbound at first', async () => {
    const store = new InMemoryQuoteStore();
    await store.save(QUOTE);
    await expect(store.findById('quote-1')).resolves.toEqual({
      quote: QUOTE,
      boundIntentId: null,
    });
  });

  it('keeps the binding when the same quote id is re-saved', async () => {
    const store = new InMemoryQuoteStore();
    await store.save(QUOTE);
    await store.bind('quote-1', 'intent-1');
    await store.save({ ...QUOTE, fetchedAt: '2026-05-01T00:00:30.000Z' });
    const stored = await store.findById('quote-1');
    expect(stored?.boundIntentId).toBe('intent-1');
    expect(stored?.quote.fetchedAt).toBe('2026-05-01T00:00:30.000Z');
  });

  it('returns null for unknown quotes', async () => {
    const store = new InMemoryQuoteStore();
    await expect(store.findById('nope')).resolves.toBeNull();
  });

  it('binds a fresh quote to an intent (single-use)', async () => {
    const store = new InMemoryQuoteStore();
    await store.save(QUOTE);
    await expect(store.bind('quote-1', 'intent-1')).resolves.toBe(true);
    const stored = await store.findById('quote-1');
    expect(stored?.boundIntentId).toBe('intent-1');
  });

  it('re-binding by the same intent is idempotent', async () => {
    const store = new InMemoryQuoteStore();
    await store.save(QUOTE);
    await store.bind('quote-1', 'intent-1');
    await expect(store.bind('quote-1', 'intent-1')).resolves.toBe(true);
  });

  it('refuses to bind a quote already bound to a different intent', async () => {
    const store = new InMemoryQuoteStore();
    await store.save(QUOTE);
    await store.bind('quote-1', 'intent-1');
    await expect(store.bind('quote-1', 'intent-2')).resolves.toBe(false);
    const stored = await store.findById('quote-1');
    expect(stored?.boundIntentId).toBe('intent-1');
  });

  it('refuses to bind an unknown quote', async () => {
    const store = new InMemoryQuoteStore();
    await expect(store.bind('nope', 'intent-1')).resolves.toBe(false);
  });
});
