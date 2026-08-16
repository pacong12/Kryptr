import { RATE_LIMIT, type RateLimitPort } from '../domain/rate-limit.port';

/**
 * SecReview68 C4: fixed-window budget per client ip for the public
 * verification endpoint (anti-enumeration). Frozen constants — the
 * wave-5 env-policy ruling keeps rate-limit env wiring for the later
 * metadata layer; code constants until then.
 *
 * Budget rationale: the consent chip fetches once per consent view and
 * backoffice reviewers page slowly — 30 requests/minute/ip leaves ample
 * headroom while throttling id enumeration. Fail-open by design ONLY in
 * the sense that a limiter restart resets budget (availability over
 * lockout: the gate, not this limiter, is the security boundary).
 */
export const VERIFICATION_RATE_LIMIT_MAX = 30;
export const VERIFICATION_RATE_LIMIT_WINDOW_MS = 60_000;

export class InMemoryFixedWindowRateLimit implements RateLimitPort {
  private windowStart: number;
  private readonly counts = new Map<string, number>();

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.windowStart = this.now();
  }

  tryConsume(key: string): boolean {
    const timestamp = this.now();
    if (timestamp >= this.windowStart + this.windowMs) {
      this.counts.clear();
      this.windowStart = timestamp;
    }
    const used = this.counts.get(key) ?? 0;
    if (used >= this.maxPerWindow) {
      return false;
    }
    this.counts.set(key, used + 1);
    return true;
  }
}

export const RATE_LIMIT_PROVIDER = {
  provide: RATE_LIMIT,
  useFactory: (): RateLimitPort =>
    new InMemoryFixedWindowRateLimit(
      VERIFICATION_RATE_LIMIT_MAX,
      VERIFICATION_RATE_LIMIT_WINDOW_MS,
    ),
};
