import type { TransactionIntent } from '@kryptr/shared-types';
import { StaticPriceFeed } from './static-price-feed';

function makeIntent(overrides: Partial<TransactionIntent>): TransactionIntent {
  return {
    id: 'intent-1',
    walletId: 'wallet-1',
    chain: 'base',
    kind: 'transfer',
    to: '0x1111111111111111111111111111111111111111',
    asset: null,
    amount: '500000000000000000',
    origin: 'user',
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('StaticPriceFeed (wave-2 price port impl)', () => {
  it('prices base native ETH at the static rate', async () => {
    const feed = new StaticPriceFeed();
    // 0.5 ETH * $3000 = $1500
    await expect(feed.getUsdValue(makeIntent({}))).resolves.toBe(1500);
    await expect(feed.getSpotPrice('base', null)).resolves.toBe(3000);
  });

  it('prices known tokens with their own decimals', async () => {
    const feed = new StaticPriceFeed();
    await expect(
      feed.getUsdValue(
        makeIntent({
          asset: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          amount: '2500000000',
        }),
      ),
    ).resolves.toBe(2500);
  });

  it('returns null for assets without a static price', async () => {
    const feed = new StaticPriceFeed();
    await expect(
      feed.getUsdValue(makeIntent({ chain: 'solana' })),
    ).resolves.toBeNull();
    await expect(
      feed.getSpotPrice('base', '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'),
    ).resolves.toBeNull();
  });

  it('returns null when the amount is not a plain decimal integer', async () => {
    const feed = new StaticPriceFeed();
    await expect(
      feed.getUsdValue(makeIntent({ amount: 'not-a-number' })),
    ).resolves.toBeNull();
  });

  it('fails closed when the feed data is older than the TTL', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));
      const feed = new StaticPriceFeed({ ttlMs: 30_000 });
      await expect(feed.getSpotPrice('base', null)).resolves.toBe(3000);
      jest.setSystemTime(new Date('2026-05-01T00:01:00.000Z'));
      await expect(feed.getSpotPrice('base', null)).resolves.toBeNull();
      await expect(feed.getUsdValue(makeIntent({}))).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports healthy FeedHealth when fresh and stale after TTL', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));
      const feed = new StaticPriceFeed({ ttlMs: 30_000 });
      await feed.getSpotPrice('base', null);
      let health = feed.health();
      expect(health).toMatchObject({
        feedId: 'price:static',
        source: 'static',
        status: 'healthy',
      });
      expect(health.lastUpdateAt).toBe('2026-05-01T00:00:00.000Z');

      jest.setSystemTime(new Date('2026-05-01T00:01:00.000Z'));
      health = feed.health();
      expect(health.status).toBe('stale');
      expect(health.priceAgeSec).toBe(60);
    } finally {
      jest.useRealTimers();
    }
  });
});
