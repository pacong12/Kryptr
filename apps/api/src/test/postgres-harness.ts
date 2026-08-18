import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Postgres integration harness (wave-6 S1) — the redis-harness analogue
 * for the DATABASE_URL-gated adapter suites.
 *
 * .env resolution: jest runs with cwd = apps/api; dotenv does NOT walk
 * up the tree, so the repo-root .env is loaded explicitly. dotenv v17
 * keeps the LAST occurrence of a duplicated key, and never overrides a
 * variable already set in the environment — which is exactly why the
 * suites connect through postgresTestUrl(): POSTGRES_TEST_URL wins over
 * DATABASE_URL, so dev machines whose .env carries a pooler URL can
 * still aim the integration suites at the session-mode compose DB.
 */
import { postgresTestUrl } from './env-gate';

dotenv.config({
  path: [
    resolve(__dirname, '../../.env'),
    resolve(__dirname, '../../../../.env'),
  ],
});

/** Tables truncated between tests (phase-1 scope; extend per phase). */
const TRUNCATE_TARGETS = [
  'sign_requests',
  'decision_audit',
  'sign_events',
  'spend_ledger',
  'intents',
  'quotes',
  'deploy_records',
  'verification_artifacts',
  'order_executions',
  'orders',
  'kill_switch_state',
  'kill_switch_audit',
  'security_policies',
  'wallets',
] as const;

/** Fresh Prisma client with its OWN pg pool — one call = one isolated
 *  connection set, so concurrency tests get genuinely separate backends. */
export function makePostgresTestClient(): PrismaClient {
  const url = postgresTestUrl();
  if (!url) {
    throw new Error(
      'makePostgresTestClient: neither POSTGRES_TEST_URL nor DATABASE_URL is set',
    );
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

/** Clean slate: truncate every S1 table (CASCADE covers FK order). */
export async function truncateAllTables(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE ${TRUNCATE_TARGETS.map((t) => `"${t}"`).join(', ')} CASCADE`,
  );
}

/** Disconnect a test client (afterAll/afterEach teardown). */
export async function disconnectTestClient(db: PrismaClient): Promise<void> {
  await db.$disconnect();
}
