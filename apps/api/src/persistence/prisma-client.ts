import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Wave-6 S1 persistence wiring (design §9): the process-wide Prisma client
 * for the Postgres-backed adapters. Prisma 7 requires a driver adapter —
 * the connection is owned by @prisma/adapter-pg (pg pool) against
 * DATABASE_URL: the Supabase pooler in TRANSACTION mode (pgbouncer=true).
 *
 * Pooler safety rules this module exists to enforce:
 *  - DDL/migrations NEVER run through the pooler (prisma.config.ts uses
 *    DIRECT_URL, session mode);
 *  - every multi-statement unit of work runs inside ONE interactive
 *    $transaction, which pins a single pooled connection for its duration
 *    (advisory locks, ON CONFLICT RETURNING sequences stay on one backend);
 *  - no prepared statement features across pooler connections.
 *
 * Hermetic default: modules bind the in-memory adapters unless
 * PERSISTENCE_MODE=postgres, and this factory throws (fail-closed) when
 * that mode is selected without DATABASE_URL.
 */

export const PERSISTENCE_MODE_ENV = 'PERSISTENCE_MODE';

/** True when the Postgres-backed adapters should be wired (env at boot). */
export function isPostgresPersistence(): boolean {
  return process.env[PERSISTENCE_MODE_ENV] === 'postgres';
}

let client: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL is required when PERSISTENCE_MODE=postgres (fail-closed)',
      );
    }
    const adapter = new PrismaPg({ connectionString: url });
    client = new PrismaClient({ adapter });
  }
  return client;
}

/** Test seam: drop the cached client (integration harness teardown). */
export function resetPrismaClientForTests(): void {
  client = null;
}
