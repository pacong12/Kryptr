/**
 * Env-gated test helpers — the canonical way to skip keyed suites.
 *
 * Jest has no describe.skipIf, so keyed adapter tests (0x, CoinGecko) use
 * these helpers: when the key is absent (always in CI) the suite is
 * registered with .skip and a clear reason is logged once, so CI logs show
 * WHY nothing ran instead of a silent gap.
 *
 * Canonical env names live here (single source of truth):
 *   ZEROX_API_KEY      — 0x swap aggregator
 *   COINGECKO_API_KEY  — CoinGecko price feed
 *
 * Usage:
 *   describeKeyed('ZEROX_API_KEY', '0x adapter (keyed)', () => { ... });
 *   itKeyed('COINGECKO_API_KEY', 'fetches spot price', async () => { ... });
 */

export const KEYED_ENV_NAMES = ['ZEROX_API_KEY', 'COINGECKO_API_KEY'] as const;
export type KeyedEnvName = (typeof KEYED_ENV_NAMES)[number];

function hasKey(name: KeyedEnvName): boolean {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

/** Runs the suite only when the key is set; otherwise skips with a logged reason. */
export function describeKeyed(
  name: KeyedEnvName,
  title: string,
  fn: () => void,
): void {
  if (hasKey(name)) {
    describe(title, fn);
    return;
  }
  process.stdout.write(
    `[env-gate] skipped "${title}": missing ${name} (keyed test)\n`,
  );
  describe.skip(title, fn);
}

/** Runs one test only when the key is set; otherwise skips it. */
export function itKeyed(
  name: KeyedEnvName,
  title: string,
  fn: jest.ProvidesCallback,
  timeoutMs?: number,
): void {
  if (hasKey(name)) {
    it(title, fn, timeoutMs);
    return;
  }
  it.skip(title, fn);
}
