import type {
  ChainId,
  FeedHealth,
  TriggerPricePrint,
} from '@kryptr/shared-types';
import type { TriggerPricePort } from '../domain/trigger-price.port';
import type { PriceFeedPort } from '../../security/application/ports';

/**
 * HINT trigger source (freeze §4): wraps the wave-3 PriceFeedPort
 * (CoinGecko when keyed/configured, static in dev) as a pair print:
 * spot(base)/spot(quote). Any unknown leg -> null (fail-closed). The
 * deviation check against the Chainlink primary happens in the
 * evaluator, never here.
 */
export class PriceFeedTriggerHint implements TriggerPricePort {
  constructor(
    private readonly priceFeed: PriceFeedPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getPrint(input: {
    chain: ChainId;
    baseAsset: `0x${string}` | null;
    quoteAsset: `0x${string}` | null;
  }): Promise<TriggerPricePrint | null> {
    const [baseUsd, quoteUsd] = await Promise.all([
      this.priceFeed.getSpotPrice(input.chain, input.baseAsset),
      this.priceFeed.getSpotPrice(input.chain, input.quoteAsset),
    ]);
    if (baseUsd === null || quoteUsd === null || quoteUsd <= 0) {
      return null;
    }
    const upstreamSource = this.priceFeed.health().source;
    return {
      source:
        upstreamSource === 'coingecko'
          ? 'coingecko'
          : upstreamSource === 'chainlink'
            ? 'chainlink'
            : 'static',
      priceUsd: String(baseUsd / quoteUsd),
      observedAt: this.now().toISOString(),
    };
  }

  health(): FeedHealth {
    const upstream = this.priceFeed.health();
    return {
      feedId: 'trigger-hint',
      source: upstream.source,
      status: upstream.status,
      lastUpdateAt: upstream.lastUpdateAt,
      priceAgeSec: upstream.priceAgeSec,
    };
  }
}
