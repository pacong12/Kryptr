/**
 * Decides which env files AppModule may load.
 *
 * Tests must be hermetic: suites pin their own env (scopedEnv/setEnv) and
 * must never inherit real `.env` keys or modes. jest sets NODE_ENV=test in
 * the parent process for BOTH worker and --runInBand modes (smoke and
 * test:live run in-band), so keying on NODE_ENV=test covers every test
 * target. Keyed/live tests still opt in because this guard only stops FILE
 * loading — env-gate and test:live read process.env directly, so a dev who
 * exports keys (`set -a; . ./.env`) keeps that path working.
 *
 * `nx serve` / build never set NODE_ENV=test, so they keep reading
 * `.env` (then `.env.example` as documented fallback).
 */
export function resolveEnvFilePaths(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return env.NODE_ENV === 'test' ? [] : ['.env', '.env.example'];
}
