import { Inject, Injectable } from '@nestjs/common';
import type { FeedHealth } from '@kryptr/shared-types';
import { PRICE_FEED, type PriceFeedPort } from './ports';
import {
  DEX_AGGREGATOR,
  type DexAggregatorPort,
} from '../../trading/domain/dex-aggregator.port';

export interface FeedHealthReport {
  feeds: FeedHealth[];
  /** True when any feed is not healthy. */
  degraded: boolean;
  /** feedIds that are stale or down. */
  staleFeedIds: string[];
}

/**
 * Collects freshness for every data feed the gate depends on (price
 * feed + dex aggregator) for GET /health/feeds. The envelope choice
 * (ok vs degraded err) is made by the controller from this report.
 */
@Injectable()
export class GetFeedHealthUseCase {
  constructor(
    @Inject(PRICE_FEED) private readonly priceFeed: PriceFeedPort,
    @Inject(DEX_AGGREGATOR) private readonly dex: DexAggregatorPort,
  ) {}

  async execute(): Promise<FeedHealthReport> {
    const feeds = [this.priceFeed.health(), this.dex.health()];
    const staleFeedIds = feeds
      .filter((feed) => feed.status !== 'healthy')
      .map((feed) => feed.feedId);
    return { feeds, degraded: staleFeedIds.length > 0, staleFeedIds };
  }
}
