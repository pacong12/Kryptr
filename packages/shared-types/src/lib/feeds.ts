/**
 * Health reporting for external data feeds (price oracle, DEX aggregator).
 * Surfaced in the backoffice via GET /api/health/feeds (DeckUI wave 2).
 * The API owns staleness thresholds; clients only render status.
 */

export const FEED_STATUSES = ['healthy', 'stale', 'down'] as const;
export type FeedStatus = (typeof FEED_STATUSES)[number];

export interface FeedHealth {
  /** Stable identifier, e.g. 'price:static', 'dex:static-mock'. */
  feedId: string;
  /** Upstream source name, e.g. 'static', 'coingecko', 'chainlink', '0x'. */
  source: string;
  status: FeedStatus;
  /** ISO-8601 of the last successful read; null if never read. */
  lastUpdateAt: string | null;
  /** Age in seconds of the most recent price/quote; null if unavailable. */
  priceAgeSec: number | null;
}
