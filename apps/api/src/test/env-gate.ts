/**
 * Env-gate helpers for keyed integration tests (0x, CoinGecko). Jest has
 * no describe.skipIf, so these run the suite when the canonical env key
 * is present and skip with a logged reason otherwise.
 *
 * Ops owns the canonical env names (docs/tasks/wave3-ops.md); vault
 * vendors this file so keyed suites compile before the ops PR lands.
 * Shape mirrors ops' final version (chore/ci-wave3) so the two copies
 * converge at rebase. Kept out of tsconfig.app.json (jest globals),
 * checked via the spec project.
 */

export const KEYED_ENV_NAMES = ['ZEROX_API_KEY', 'COINGECKO_API_KEY'] as const;
export type KeyedEnvName = (typeof KEYED_ENV_NAMES)[number];

type SuiteBody = () => void;

function hasKey(envName: KeyedEnvName): boolean {
  const value = process.env[envName];
  return typeof value === 'string' && value.trim().length > 0;
}

function logSkip(title: string, envName: KeyedEnvName): void {
  // eslint-disable-next-line no-console
  console.warn(
    `[env-gate] skipped "${title}": missing ${envName} (keyed test)`,
  );
}

/** Run the suite only when envName is set; otherwise skip + log why. */
export function describeKeyed(
  envName: KeyedEnvName,
  title: string,
  body: SuiteBody,
): void {
  if (hasKey(envName)) {
    describe(title, body);
  } else {
    describe.skip(title, body);
    logSkip(title, envName);
  }
}

/** Run a single test only when envName is set; otherwise skip + log. */
export function itKeyed(
  envName: KeyedEnvName,
  title: string,
  body: jest.ProvidesCallback,
  timeoutMs?: number,
): void {
  if (hasKey(envName)) {
    it(title, body, timeoutMs);
  } else {
    it.skip(title, body);
    logSkip(title, envName);
  }
}
