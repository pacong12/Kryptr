import type { TransactionIntent } from '@kryptr/shared-types';
import { CoingeckoPriceFeed } from './coingecko-price-feed';

function intent(overrides: Partial<TransactionIntent>): TransactionIntent {
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

function jsonOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

const PRICES = { ethereum: { usd: 2500.5 }, 'usd-coin': { usd: 1 } };

describe('CoingeckoPriceFeed (wave-3 price port impl)', () => {
  it('fails closed and reports unconfigured when no API key exists', async () => {
    const fetchImpl = jest.fn();
    const feed = new CoingeckoPriceFeed({ apiKey: null, fetchImpl });
    await expect(feed.getSpotPrice('base', null)).resolves.toBeNull();
    await expect(feed.getUsdValue(intent({}))).resolves.toBeNull();
    expect(feed.health().status).toBe('unconfigured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches the spot price with key header and mapped coingecko id', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonOk(PRICES));
    const feed = new CoingeckoPriceFeed({ apiKey: 'k', fetchImpl });
    await expect(feed.getSpotPrice('base', null)).resolves.toBe(2500.5);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain('ids=ethereum');
    expect(String(url)).toContain('vs_currencies=usd');
    expect((init as RequestInit).headers).toMatchObject({
      'x-cg-demo-api-key': 'k',
    });
  });

  it('values intents with fixed-point decimals (0.5 ETH * 2500.5)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonOk(PRICES));
    const feed = new CoingeckoPriceFeed({ apiKey: 'k', fetchImpl });
    await expect(feed.getUsdValue(intent({}))).resolves.toBe(1250.25);
  });

  it('values USDC with 6 decimals', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonOk(PRICES));
    const feed = new CoingeckoPriceFeed({ apiKey: 'k', fetchImpl });
    await expect(
      feed.getUsdValue(
        intent({
          asset: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          amount: '2500000000',
        }),
      ),
    ).resolves.toBe(2500);
  });

  it('caches within the TTL (one fetch for repeated reads)', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));
      const fetchImpl = jest.fn().mockResolvedValue(jsonOk(PRICES));
      const feed = new CoingeckoPriceFeed({
        apiKey: 'k',
        fetchImpl,
        ttlMs: 30_000,
      });
      await feed.getSpotPrice('base', null);
      jest.setSystemTime(new Date('2026-05-01T00:00:20.000Z'));
      await feed.getSpotPrice('base', null);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      jest.setSystemTime(new Date('2026-05-01T00:00:31.000Z'));
      await feed.getSpotPrice('base', null);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails closed when the cache is stale and the refresh errors', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));
      const fetchImpl = jest
        .fn()
        .mockResolvedValueOnce(jsonOk(PRICES))
        .mockRejectedValueOnce(new Error('network'));
      const feed = new CoingeckoPriceFeed({
        apiKey: 'k',
        fetchImpl,
        ttlMs: 30_000,
      });
      await expect(feed.getSpotPrice('base', null)).resolves.toBe(2500.5);
      jest.setSystemTime(new Date('2026-05-01T00:01:00.000Z'));
      await expect(feed.getSpotPrice('base', null)).resolves.toBeNull();
      await expect(feed.getUsdValue(intent({}))).resolves.toBeNull();
      expect(feed.health().status).toBe('down');
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails closed on non-OK HTTP (rate limit)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as unknown as Response);
    const feed = new CoingeckoPriceFeed({ apiKey: 'k', fetchImpl });
    await expect(feed.getSpotPrice('base', null)).resolves.toBeNull();
    expect(feed.health().status).toBe('down');
  });

  it('returns null for assets without a coingecko mapping (no fetch)', async () => {
    const fetchImpl = jest.fn();
    const feed = new CoingeckoPriceFeed({ apiKey: 'k', fetchImpl });
    await expect(
      feed.getSpotPrice('robinhood-chain', null),
    ).resolves.toBeNull();
    await expect(
      feed.getSpotPrice('base', '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports healthy FeedHealth with age after a successful read', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));
      const fetchImpl = jest.fn().mockResolvedValue(jsonOk(PRICES));
      const feed = new CoingeckoPriceFeed({ apiKey: 'k', fetchImpl });
      await feed.getSpotPrice('base', null);
      jest.setSystemTime(new Date('2026-05-01T00:00:05.000Z'));
      const health = feed.health();
      expect(health).toMatchObject({
        feedId: 'price:coingecko',
        source: 'coingecko',
        status: 'healthy',
        lastUpdateAt: '2026-05-01T00:00:00.000Z',
        priceAgeSec: 5,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports stale when configured data outlives the TTL', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));
      const fetchImpl = jest.fn().mockResolvedValue(jsonOk(PRICES));
      const feed = new CoingeckoPriceFeed({
        apiKey: 'k',
        fetchImpl,
        ttlMs: 30_000,
      });
      await feed.getSpotPrice('base', null);
      // Let the TTL pass but make the (lazy) refresh succeed: status by
      // age alone is stale until a read refreshes it.
      jest.setSystemTime(new Date('2026-05-01T00:01:00.000Z'));
      expect(feed.health().status).toBe('stale');
    } finally {
      jest.useRealTimers();
    }
  });
});
