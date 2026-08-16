import type {
  ChainId,
  FeedHealth,
  TriggerPricePrint,
} from '@kryptr/shared-types';
import type { TriggerPricePort } from '../domain/trigger-price.port';

/**
 * Narrow seam over a Chainlink Data Feeds aggregator proxy
 * (latestRoundData). The viem import stays confined to the infra
 * reader; specs stub THIS interface (wave-3 lesson).
 */
export interface ChainlinkRoundReader {
  latestRoundData(feed: `0x${string}`): Promise<{
    answer: bigint;
    /** Unix seconds of the last update. */
    updatedAt: bigint;
  }>;
}

/**
 * Chainlink feed registry (static table, Record by rule). Keyed by
 * '<chainId>:<asset|native>'. Base proxies:
 *  - ETH/USD  0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70 (heartbeat ~20.5m)
 *  - USDC/USD 0x7e860098F58bBFC8648a4311b374B1D669a2bc6B
 * All answers are 8-decimals USD on Base today; decimals travel with
 * the entry so a future non-8 feed is a data change, not a code change.
 */
export const CHAINLINK_FEEDS: Record<
  string,
  { proxy: `0x${string}`; decimals: number }
> = {
  'base:native': {
    proxy: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
    decimals: 8,
  },
  'base:0x833589fcd6edb6e08f4c7c32d4f71b54bfa02913': {
    proxy: '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B',
    decimals: 8,
  },
};

/**
 * PRIMARY trigger source (freeze §4): pair price derived from two
 * on-chain USD feeds (base ÷ quote). Keyless read via viem. Unknown
 * pair, missing feed, or RPC failure -> null (fail-closed upstream).
 */
export class ChainlinkTriggerPrice implements TriggerPricePort {
  private lastPrint: TriggerPricePrint | null = null;

  constructor(
    private readonly reader: ChainlinkRoundReader,
    private readonly options: {
      now?: () => Date;
      feeds?: Record<string, { proxy: `0x${string}`; decimals: number }>;
    } = {},
  ) {}

  private get now(): () => Date {
    return this.options.now ?? (() => new Date());
  }

  private get feeds() {
    return this.options.feeds ?? CHAINLINK_FEEDS;
  }

  async getPrint(input: {
    chain: ChainId;
    baseAsset: `0x${string}` | null;
    quoteAsset: `0x${string}` | null;
  }): Promise<TriggerPricePrint | null> {
    const baseFeed = this.feedFor(input.chain, input.baseAsset);
    const quoteFeed = this.feedFor(input.chain, input.quoteAsset);
    if (!baseFeed || !quoteFeed) {
      return null;
    }
    try {
      const [base, quote] = await Promise.all([
        this.reader.latestRoundData(baseFeed.proxy),
        this.reader.latestRoundData(quoteFeed.proxy),
      ]);
      if (base.answer <= 0n || quote.answer <= 0n) {
        return null;
      }
      const baseUsd = Number(base.answer) / 10 ** baseFeed.decimals;
      const quoteUsd = Number(quote.answer) / 10 ** quoteFeed.decimals;
      const observedSeconds = Math.min(
        Number(base.updatedAt),
        Number(quote.updatedAt),
      );
      const print: TriggerPricePrint = {
        source: 'chainlink',
        priceUsd: String(baseUsd / quoteUsd),
        observedAt: new Date(observedSeconds * 1000).toISOString(),
      };
      this.lastPrint = print;
      return print;
    } catch {
      return null; // RPC failure = unknown, never a stale pass
    }
  }

  health(): FeedHealth {
    return {
      feedId: 'trigger-price:chainlink',
      source: 'chainlink',
      status: this.lastPrint ? 'healthy' : 'down',
      lastUpdateAt: this.lastPrint?.observedAt ?? null,
      priceAgeSec: this.lastPrint
        ? Math.max(
            0,
            Math.round(
              (this.now().getTime() - Date.parse(this.lastPrint.observedAt)) /
                1000,
            ),
          )
        : null,
    };
  }

  private feedFor(
    chain: ChainId,
    asset: `0x${string}` | null,
  ): { proxy: `0x${string}`; decimals: number } | null {
    const key = `${chain}:${asset === null ? 'native' : asset.toLowerCase()}`;
    return this.feeds[key] ?? null;
  }
}
