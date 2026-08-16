import type {
  ChainId,
  FeedHealth,
  TransactionIntent,
} from '@kryptr/shared-types';
import type { PriceFeedPort } from '../application/ports';

/**
 * Wave-2 price port implementation. Same static table as the wave-1
 * stub, now with an explicit freshness model: prices are only valid for
 * ttlMs after the feed was last updated; beyond that the feed reports
 * stale and every lookup fails closed (null). A CoinGecko adapter will
 * implement the same PriceFeedPort interface.
 */

/** USD price of one WHOLE unit, plus display decimals for the asset. */
const STATIC_PRICES: Record<string, { usd: number; decimals: number }> = {
  'base:native': { usd: 3000, decimals: 18 },
  'robinhood-chain:native': { usd: 1, decimals: 18 },
  'base:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { usd: 1, decimals: 6 },
};

const NON_DECIMAL = /[^0-9]/;

export interface StaticPriceFeedOptions {
  ttlMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export class StaticPriceFeed implements PriceFeedPort {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private lastUpdatedAtMs: number;

  constructor(options: StaticPriceFeedOptions = {}) {
    this.ttlMs = options.ttlMs ?? 30_000;
    this.now = options.now ?? Date.now;
    this.lastUpdatedAtMs = this.now();
  }

  async getSpotPrice(
    chain: ChainId,
    asset: `0x${string}` | null,
  ): Promise<number | null> {
    if (!this.isFresh()) {
      return null;
    }
    const key = `${chain}:${asset ?? 'native'}`;
    const entry = STATIC_PRICES[key];
    return entry ? entry.usd : null;
  }

  async getUsdValue(intent: TransactionIntent): Promise<number | null> {
    if (!this.isFresh()) {
      return null;
    }
    const price = STATIC_PRICES[`${intent.chain}:${intent.asset ?? 'native'}`];
    if (!price) {
      return null;
    }
    if (!intent.amount || NON_DECIMAL.test(intent.amount)) {
      return null;
    }
    // Fixed-point: price in micro-USD, so sub-unit amounts keep precision.
    const usdMicro = Math.round(price.usd * 1_000_000);
    const raw =
      (BigInt(intent.amount) * BigInt(usdMicro)) / BigInt(10 ** price.decimals);
    return Number(raw) / 1_000_000;
  }

  health(): FeedHealth {
    const ageMs = this.now() - this.lastUpdatedAtMs;
    const fresh = ageMs <= this.ttlMs;
    return {
      feedId: 'price:static',
      source: 'static',
      status: fresh ? 'healthy' : 'stale',
      lastUpdateAt: new Date(this.lastUpdatedAtMs).toISOString(),
      priceAgeSec: Math.floor(ageMs / 1000),
    };
  }

  private isFresh(): boolean {
    return this.now() - this.lastUpdatedAtMs <= this.ttlMs;
  }
}
