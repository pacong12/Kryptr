import { Inject, Injectable } from '@nestjs/common';
import type { FeedHealth } from '@kryptr/shared-types';
import { PRICE_FEED, type PriceFeedPort } from './ports';
import {
  DEX_AGGREGATOR,
  type DexAggregatorPort,
} from '../../trading/domain/dex-aggregator.port';
import { VIEM_CLIENT, type ViemClientPort } from '../../chain/viem-client.port';

export interface FeedHealthReport {
  feeds: FeedHealth[];
  /** True when any feed is not healthy. */
  degraded: boolean;
  /** feedIds that are stale or down. */
  staleFeedIds: string[];
}

/**
 * Collects freshness for every data feed the gate depends on (price
 * feed + dex aggregator + chain reader) for GET /health/feeds. Every
 * status except 'healthy' — including 'unconfigured' — degrades the
 * envelope: a missing key is a config TODO that must stay visible.
 */
@Injectable()
export class GetFeedHealthUseCase {
  constructor(
    @Inject(PRICE_FEED) private readonly priceFeed: PriceFeedPort,
    @Inject(DEX_AGGREGATOR) private readonly dex: DexAggregatorPort,
    @Inject(VIEM_CLIENT) private readonly viem: ViemClientPort,
  ) {}

  async execute(): Promise<FeedHealthReport> {
    const feeds = [
      this.priceFeed.health(),
      this.dex.health(),
      this.viem.health(),
    ];
    const staleFeedIds = feeds
      .filter((feed) => feed.status !== 'healthy')
      .map((feed) => feed.feedId);
    return { feeds, degraded: staleFeedIds.length > 0, staleFeedIds };
  }
}
