import { InMemoryFixedWindowRateLimit } from './in-memory-fixed-window.rate-limit';

/**
 * SecReview68 C4: fixed-window limiter for the public verification
 * endpoint (anti-enumeration). Deterministic via an injected clock.
 */
describe('InMemoryFixedWindowRateLimit', () => {
  it('allows up to the budget per key, then denies', () => {
    const limit = new InMemoryFixedWindowRateLimit(3, 60_000, () => 0);
    expect(limit.tryConsume('a')).toBe(true);
    expect(limit.tryConsume('a')).toBe(true);
    expect(limit.tryConsume('a')).toBe(true);
    expect(limit.tryConsume('a')).toBe(false);
    expect(limit.tryConsume('a')).toBe(false);
  });

  it('tracks keys independently', () => {
    const limit = new InMemoryFixedWindowRateLimit(1, 60_000, () => 0);
    expect(limit.tryConsume('a')).toBe(true);
    expect(limit.tryConsume('b')).toBe(true);
    expect(limit.tryConsume('a')).toBe(false);
    expect(limit.tryConsume('b')).toBe(false);
  });

  it('resets the whole window once it rolls over', () => {
    let now = 0;
    const limit = new InMemoryFixedWindowRateLimit(2, 60_000, () => now);
    expect(limit.tryConsume('a')).toBe(true);
    expect(limit.tryConsume('a')).toBe(true);
    expect(limit.tryConsume('a')).toBe(false);
    now = 60_000; // next window
    expect(limit.tryConsume('a')).toBe(true);
    expect(limit.tryConsume('b')).toBe(true);
  });

  it('denials do not consume budget (retry stays honest)', () => {
    let now = 0;
    const limit = new InMemoryFixedWindowRateLimit(1, 60_000, () => now);
    expect(limit.tryConsume('a')).toBe(true);
    expect(limit.tryConsume('a')).toBe(false);
    expect(limit.tryConsume('a')).toBe(false);
    now = 60_000;
    // Exactly one request allowed again — denials never ate the budget.
    expect(limit.tryConsume('a')).toBe(true);
    expect(limit.tryConsume('a')).toBe(false);
  });
});
