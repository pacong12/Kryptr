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

/**
 * Display decimals per chain:asset, shared by every PriceFeedPort
 * implementation (static + CoinGecko). Null asset = chain native.
 */
export const ASSET_DECIMALS: Record<string, number> = {
  'base:native': 18,
  'robinhood-chain:native': 18,
  'base:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6,
};

/** USD price of one WHOLE unit, keyed chain:asset. */
const STATIC_USD: Record<string, number> = {
  'base:native': 3000,
  'robinhood-chain:native': 1,
  'base:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 1,
};

/** Rejects anything that is not a plain decimal integer string. */
export const NON_DECIMAL_AMOUNT = /[^0-9]/;

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
    const usd = STATIC_USD[key];
    return usd ?? null;
  }

  async getUsdValue(intent: TransactionIntent): Promise<number | null> {
    if (!this.isFresh()) {
      return null;
    }
    const key = `${intent.chain}:${intent.asset ?? 'native'}`;
    const usd = STATIC_USD[key];
    const decimals = ASSET_DECIMALS[key];
    if (usd === undefined || decimals === undefined) {
      return null;
    }
    if (!intent.amount || NON_DECIMAL_AMOUNT.test(intent.amount)) {
      return null;
    }
    // Fixed-point: price in micro-USD, so sub-unit amounts keep precision.
    const usdMicro = Math.round(usd * 1_000_000);
    const raw =
      (BigInt(intent.amount) * BigInt(usdMicro)) / BigInt(10 ** decimals);
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
