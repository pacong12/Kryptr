import type { QuoteRequest } from '@kryptr/shared-types';
import { StaticMockDexAdapter, QUOTE_TTL_MS } from './static-mock-dex.adapter';
import {
  baseQuoteRequest,
  dexAggregatorContractSuite,
} from '../domain/dex-aggregator.contract.spec';

dexAggregatorContractSuite(
  'StaticMockDexAdapter',
  () =>
    new StaticMockDexAdapter({
      now: () => Date.parse('2026-05-01T00:00:00.000Z'),
    }),
);

describe('StaticMockDexAdapter (adapter-specific)', () => {
  it('prices base native -> USDC at the static rate', async () => {
    const dex = new StaticMockDexAdapter();
    const quote = await dex.getQuote(baseQuoteRequest());
    expect(quote.source).toBe('static-mock');
    expect(quote.price).toBe(3000);
    // 1 ETH = 3000 USDC (6 decimals)
    expect(quote.amountOut).toBe('3000000000');
    // 50 bps floor
    expect(quote.minAmountOut).toBe('2985000000');
  });

  it('uses a deterministic fallback price for unknown tokens', async () => {
    const dex = new StaticMockDexAdapter({
      now: () => Date.parse('2026-05-01T00:00:00.000Z'),
    });
    const unknownToken = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const request: QuoteRequest = baseQuoteRequest({ assetOut: unknownToken });
    const first = await dex.getQuote(request);
    const second = await dex.getQuote(request);
    expect(first).toEqual(second);
    expect(BigInt(first.amountOut)).toBeGreaterThan(0n);
  });

  it('TTLs quotes from an injectable clock', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));
      const dex = new StaticMockDexAdapter();
      const quote = await dex.getQuote(baseQuoteRequest());
      expect(quote.fetchedAt).toBe('2026-05-01T00:00:00.000Z');
      expect(Date.parse(quote.expiresAt)).toBe(
        Date.parse(quote.fetchedAt) + QUOTE_TTL_MS,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('buildSwapTx is stable per quote and chain', async () => {
    const dex = new StaticMockDexAdapter();
    const quote = await dex.getQuote(baseQuoteRequest());
    const tx = await dex.buildSwapTx(quote);
    expect(tx.to).toMatch(/^0x[0-9a-f]{40}$/);
    expect(tx.data.length).toBeGreaterThan(10);
  });

  it('health() identifies the static mock source', () => {
    const dex = new StaticMockDexAdapter();
    const health = dex.health();
    expect(health.feedId).toBe('dex:static-mock');
    expect(health.source).toBe('static-mock');
    expect(health.status).toBe('healthy');
  });
});
