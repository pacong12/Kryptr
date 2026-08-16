/**
 * Rate-limit seam for the launchpad read surface (SecReview68 C4).
 * The verification endpoint is public and unauthenticated — without a
 * budget per client, artifact ids become enumerable.
 */

export const RATE_LIMIT = 'launchpad.rate-limit';

export interface RateLimitPort {
  /**
   * Consume one unit of budget for `key` (client ip). Returns false
   * once the key's window budget is exhausted (denials consume nothing).
   */
  tryConsume(key: string): boolean;
}
