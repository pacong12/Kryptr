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
 *   DATABASE_URL       — wave-6 S1 Postgres adapters (describePostgres;
 *                        POSTGRES_TEST_URL overrides the connection URL)
 *
 * Usage:
 *   describeKeyed('ZEROX_API_KEY', '0x adapter (keyed)', () => { ... });
 *   itKeyed('COINGECKO_API_KEY', 'fetches spot price', async () => { ... });
 *
 * Worker/queue suites (wave 4) use the Redis infra gate below:
 *   describeRedis('order worker (redis)', () => { ... });
 *
 * PERMANENT CONVENTION (ops + vault, wave-4 freeze):
 * - Worker suite files are named `src/**\/*.workers.ts`; they run via the
 *   `test-workers` api target (jest.workers.cts, runInBand, cache:false),
 *   which is on the CI affected line with a redis:7-alpine service
 *   container (localhost:6379, REDIS_URL set at job level).
 * - Suites needing Redis wrap in describeRedis/itRedis: gated on REDIS_URL
 *   presence — CI always has it; machines without local Redis skip with a
 *   logged reason (skip ≠ failure; CI green never depends on dev machines).
 * - Connection pattern (see redis-harness.workers.ts): Worker connections
 *   use { maxRetriesPerRequest: null }; unique queue prefix per suite;
 *   obliterate/flush between tests; event-driven waits via
 *   job.waitUntilFinished — never wall-clock sleeps.
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

export const REDIS_ENV_NAME = 'REDIS_URL';

function hasRedisUrl(): boolean {
  const value = process.env[REDIS_ENV_NAME];
  return typeof value === 'string' && value.trim().length > 0;
}

/** Runs the suite only when REDIS_URL is set; otherwise skips with a logged reason. */
export function describeRedis(title: string, fn: () => void): void {
  if (hasRedisUrl()) {
    describe(title, fn);
    return;
  }
  process.stdout.write(
    `[env-gate] skipped "${title}": ${REDIS_ENV_NAME} not set (workers test)\n`,
  );
  describe.skip(title, fn);
}

/** Runs one test only when REDIS_URL is set; otherwise skips it. */
export function itRedis(
  title: string,
  fn: jest.ProvidesCallback,
  timeoutMs?: number,
): void {
  if (hasRedisUrl()) {
    it(title, fn, timeoutMs);
    return;
  }
  it.skip(title, fn);
}

export const POSTGRES_ENV_NAME = 'DATABASE_URL';
/** Optional override for S1 integration suites. Dev machines with a
 *  dual-purpose .env (Supabase pooler + local compose) point this at the
 *  session-mode compose DB; CI service containers set DATABASE_URL only. */
export const POSTGRES_TEST_URL_NAME = 'POSTGRES_TEST_URL';

function hasPostgresUrl(): boolean {
  return typeof postgresTestUrl() === 'string';
}

/** The URL S1 integration suites connect with: POSTGRES_TEST_URL wins,
 *  else DATABASE_URL. */
export function postgresTestUrl(): string | undefined {
  for (const name of [POSTGRES_TEST_URL_NAME, POSTGRES_ENV_NAME]) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

/** Runs the suite only when DATABASE_URL is set; otherwise skips with a
 *  logged reason. Wave-6 S1 Postgres adapter suites: hermetic CI without a
 *  database skips cleanly; coordinated Postgres CI (OpsCI) sets the URL. */
export function describePostgres(title: string, fn: () => void): void {
  if (hasPostgresUrl()) {
    describe(title, fn);
    return;
  }
  process.stdout.write(
    `[env-gate] skipped "${title}": ${POSTGRES_ENV_NAME} not set (S1 postgres test)\n`,
  );
  describe.skip(title, fn);
}

/** Runs one test only when DATABASE_URL is set; otherwise skips it. */
export function itPostgres(
  title: string,
  fn: jest.ProvidesCallback,
  timeoutMs?: number,
): void {
  if (hasPostgresUrl()) {
    it(title, fn, timeoutMs);
    return;
  }
  it.skip(title, fn);
}
