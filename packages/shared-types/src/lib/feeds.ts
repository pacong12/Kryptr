import type { ChainId } from './chains.js';

/**
 * Health reporting for external data feeds (price oracle, DEX aggregator)
 * and chain connections. Surfaced in the backoffice via
 * GET /api/health/feeds and GET /api/health/chains (DeckUI). The API owns
 * staleness thresholds; clients only render status.
 *
 * Status semantics:
 * - healthy: configured and data is fresh.
 * - stale: configured, data older than the staleness threshold.
 * - down: configured but failing.
 * - unconfigured: adapter exists but has no credentials yet (wave 3+).
 *   This is a config TODO, not an outage — never page on it.
 */

export const FEED_STATUSES = [
  'healthy',
  'stale',
  'down',
  'unconfigured',
] as const;
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

/**
 * Chain connection health (wave 3), surfaced via GET /api/health/chains.
 * NEVER expose the raw RPC URL — it may embed credentials.
 */
export interface ChainReaderHealth {
  chainId: ChainId;
  /** Provider label, e.g. 'viem:mainnet.base.org' or 'static-mock'. */
  provider: string;
  reachable: boolean;
  blockHeight: number | null;
  latencyMs: number | null;
  /** ISO-8601 of the last observed block; null if unreachable. */
  lastBlockAt: string | null;
}
