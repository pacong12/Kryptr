import type { ChainId, FeedHealth, TriggerPricePrint } from '@kryptr/shared-types';

/**
 * Trigger price sources (wave 4, freeze §4). PRIMARY = Chainlink Data
 * Feeds on-chain via viem (keyless); HINT = CoinGecko keyless. Two
 * sources: |primary − hint| ≤ TRIGGER_DEVIATION_BPS must pass before a
 * limit trigger fires. Unknown/stale prices NEVER trigger — fail-closed.
 */

export const TRIGGER_PRICE = 'order-worker.trigger-price';
export const TRIGGER_HINT = 'order-worker.trigger-hint';

export interface TriggerPricePort {
  /** Latest pair print, or null when unknown/unconfigured (fail-closed). */
  getPrint(input: {
    chain: ChainId;
    baseAsset: `0x${string}` | null;
    quoteAsset: `0x${string}` | null;
  }): Promise<TriggerPricePrint | null>;
  /** Freshness for GET /health/feeds. */
  health(): FeedHealth;
}
