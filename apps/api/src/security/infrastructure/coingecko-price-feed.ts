import type {
  ChainId,
  FeedHealth,
  FeedStatus,
  TransactionIntent,
} from '@kryptr/shared-types';
import type { PriceFeedPort } from '../application/ports';
import { ASSET_DECIMALS, NON_DECIMAL_AMOUNT } from './static-price-feed';

export interface CoingeckoPriceFeedOptions {
  /** CoinGecko API key; without one the feed is unconfigured and fails closed. */
  apiKey?: string | null;
  /** Max price age before a read re-fetches and health turns stale. */
  ttlMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

/**
 * chain:asset -> CoinGecko price id. Unmapped assets fail closed (null):
 * never guess a price. Robinhood Chain native has no CoinGecko id yet.
 */
const COINGECKO_IDS: Record<string, string> = {
  'base:native': 'ethereum',
  'base:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'usd-coin',
};

const DEFAULT_TTL_MS = 30_000;

interface CacheEntry {
  usd: number;
  fetchedAtMs: number;
}

export class CoingeckoPriceFeed implements PriceFeedPort {
  private readonly apiKey: string | null;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly cache = new Map<string, CacheEntry>();
  private lastSuccessAtMs: number | null = null;
  private lastErrorAtMs: number | null = null;

  constructor(options: CoingeckoPriceFeedOptions = {}) {
    this.apiKey = options.apiKey ?? null;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? (() => Date.now());
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.baseUrl = options.baseUrl ?? 'https://api.coingecko.com';
  }

  async getSpotPrice(
    chain: ChainId,
    asset: `0x${string}` | null,
  ): Promise<number | null> {
    if (!this.apiKey) {
      return null;
    }
    const id = COINGECKO_IDS[`${chain}:${asset ?? 'native'}`];
    if (!id) {
      return null;
    }
    const cached = this.cache.get(id);
    if (cached && this.now() - cached.fetchedAtMs <= this.ttlMs) {
      return cached.usd;
    }
    try {
      const url = `${this.baseUrl}/api/v3/simple/price?ids=${id}&vs_currencies=usd`;
      const res = await this.fetchImpl(url, {
        headers: {
          accept: 'application/json',
          'x-cg-demo-api-key': this.apiKey,
        },
      });
      if (!res.ok) {
        throw new Error(`coingecko http ${res.status}`);
      }
      const body = (await res.json()) as Record<
        string,
        { usd?: unknown } | undefined
      >;
      const usd = body[id]?.usd;
      if (typeof usd !== 'number') {
        throw new Error('coingecko: missing usd price');
      }
      this.cache.set(id, { usd, fetchedAtMs: this.now() });
      this.lastSuccessAtMs = this.now();
      this.lastErrorAtMs = null;
      return usd;
    } catch {
      // Fail closed: no price, no silent stale fallback beyond the TTL.
      this.lastErrorAtMs = this.now();
      return null;
    }
  }

  async getUsdValue(intent: TransactionIntent): Promise<number | null> {
    if (!this.apiKey) {
      return null;
    }
    const key = `${intent.chain}:${intent.asset ?? 'native'}`;
    const decimals = ASSET_DECIMALS[key];
    if (decimals === undefined) {
      return null;
    }
    if (!intent.amount || NON_DECIMAL_AMOUNT.test(intent.amount)) {
      return null;
    }
    const usd = await this.getSpotPrice(intent.chain, intent.asset);
    if (usd === null) {
      return null;
    }
    // Fixed-point: price in micro-USD keeps sub-unit amounts precise.
    const usdMicro = Math.round(usd * 1_000_000);
    const raw =
      (BigInt(intent.amount) * BigInt(usdMicro)) / BigInt(10 ** decimals);
    return Number(raw) / 1_000_000;
  }

  health(): FeedHealth {
    if (!this.apiKey) {
      return {
        feedId: 'price:coingecko',
        source: 'coingecko',
        status: 'unconfigured',
        lastUpdateAt: null,
        priceAgeSec: null,
      };
    }
    const ageMs =
      this.lastSuccessAtMs === null ? null : this.now() - this.lastSuccessAtMs;
    let status: FeedStatus;
    if (ageMs !== null && ageMs <= this.ttlMs) {
      status = 'healthy';
    } else if (
      this.lastErrorAtMs !== null &&
      (this.lastSuccessAtMs === null ||
        this.lastErrorAtMs >= this.lastSuccessAtMs)
    ) {
      status = 'down';
    } else {
      status = 'stale';
    }
    return {
      feedId: 'price:coingecko',
      source: 'coingecko',
      status,
      lastUpdateAt:
        this.lastSuccessAtMs === null
          ? null
          : new Date(this.lastSuccessAtMs).toISOString(),
      priceAgeSec: ageMs === null ? null : Math.floor(ageMs / 1000),
    };
  }
}
