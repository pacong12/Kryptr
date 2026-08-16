import type { FeedHealth } from '@kryptr/shared-types';
import type { PriceFeedPort } from '../../security/application/ports';
import { PriceFeedTriggerHint } from './price-feed-trigger-hint';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bfa02913' as const;

function feed(
  prices: Record<string, number | null>,
  source = 'coingecko',
): PriceFeedPort {
  return {
    getSpotPrice: async (_chain, asset) =>
      prices[asset === null ? 'native' : asset.toLowerCase()] ?? null,
    getUsdValue: async () => null,
    health: (): FeedHealth => ({
      feedId: 'price:test',
      source,
      status: 'healthy',
      lastUpdateAt: new Date(NOW).toISOString(),
      priceAgeSec: 0,
    }),
  };
}

describe('PriceFeedTriggerHint', () => {
  it('computes the pair print as spot(base)/spot(quote)', async () => {
    const hint = new PriceFeedTriggerHint(
      feed({ native: 3000, [USDC]: 1.0001 }),
      () => new Date(NOW),
    );
    const print = await hint.getPrint({
      chain: 'base',
      baseAsset: null,
      quoteAsset: USDC,
    });
    expect(print?.source).toBe('coingecko');
    expect(Number(print?.priceUsd)).toBeCloseTo(3000 / 1.0001, 8);
    expect(print?.observedAt).toBe(new Date(NOW).toISOString());
  });

  it('returns null when either leg is unknown (fail-closed)', async () => {
    const hint = new PriceFeedTriggerHint(
      feed({ native: 3000 }),
      () => new Date(NOW),
    );
    const missingQuote = await hint.getPrint({
      chain: 'base',
      baseAsset: null,
      quoteAsset: USDC,
    });
    const missingBase = await hint.getPrint({
      chain: 'base',
      baseAsset: '0x1111111111111111111111111111111111111111',
      quoteAsset: USDC,
    });
    expect(missingQuote).toBeNull();
    expect(missingBase).toBeNull();
  });

  it('maps unknown upstream sources to the static bucket', async () => {
    const hint = new PriceFeedTriggerHint(
      feed({ native: 3000, [USDC]: 1 }, 'mystery-feed'),
      () => new Date(NOW),
    );
    const print = await hint.getPrint({
      chain: 'base',
      baseAsset: null,
      quoteAsset: USDC,
    });
    expect(print?.source).toBe('static');
  });

  it('exposes upstream health under the trigger-hint feed id', () => {
    const hint = new PriceFeedTriggerHint(feed({}), () => new Date(NOW));
    const health = hint.health();
    expect(health.feedId).toBe('trigger-hint');
    expect(health.source).toBe('coingecko');
  });
});
