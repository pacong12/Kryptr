import type { SpendLedger } from '../application/ports';
import { usdToMicros } from '../../common/micro-usd';
import { getPrismaClient } from '../../persistence/prisma-client';
import type { PrismaClient } from '../../generated/prisma/client';

/**
 * Postgres-backed daily spend ledger (wave-6 S1 §5.1). Money is integer
 * micro-USD end-to-end; the float port surface is converted at the
 * boundary (usdToMicros) and never participates in cap arithmetic.
 *
 * reserveSpend is the fused compare-and-reserve seam (Review54 F1):
 * under READ COMMITTED, two reservations for DIFFERENT intents of the
 * same wallet/day insert different PK rows and each transaction's SUM
 * would see only committed rows — both could observe "under cap" and
 * both commit. Serialization per (wallet, day) is therefore a
 * transaction-scoped advisory lock:
 *
 *   BEGIN;
 *   SELECT pg_advisory_xact_lock(hashtext(wallet || ':' || day));
 *   INSERT ... ON CONFLICT DO UPDATE;      -- last-wins per port contract
 *   SELECT SUM(usd_micros) ...;            -- post-reserve total
 *   total > cap  ->  ROLLBACK (undone)     -- reserveSpend returns null
 *   COMMIT;                                -- lock auto-released
 *
 * The whole sequence runs inside ONE Prisma interactive $transaction,
 * which pins a single pooled connection — the advisory lock and every
 * statement share one backend (never spans pooler connections).
 */

/** Sentinel thrown inside the transaction to force ROLLBACK on breach. */
const CAP_BREACH = Symbol('spend-ledger-cap-breach');

export class PostgresSpendLedger implements SpendLedger {
  constructor(private readonly db: PrismaClient = getPrismaClient()) {}

  async getSpentUsdToday(walletId: string): Promise<number> {
    const day = utcDay(new Date());
    const rows = await this.db.$queryRaw<Array<{ total: bigint | string }>>`
      SELECT COALESCE(SUM(usd_micros), 0) AS total
      FROM spend_ledger
      WHERE wallet_id = ${walletId} AND utc_day = ${day}
    `;
    // Port boundary: micros -> float USD happens ONLY here.
    return Number(BigInt(rows[0].total)) / 1_000_000;
  }

  async record(entry: {
    intentId: string;
    walletId: string;
    usd: number;
  }): Promise<void> {
    const day = utcDay(new Date());
    const micros = usdToMicros(entry.usd);
    await this.db.$executeRaw`
      INSERT INTO spend_ledger (wallet_id, utc_day, intent_id, usd_micros, recorded_at)
      VALUES (${entry.walletId}, ${day}, ${entry.intentId}, ${micros}, now())
      ON CONFLICT (wallet_id, utc_day, intent_id)
      DO UPDATE SET usd_micros = EXCLUDED.usd_micros, recorded_at = now()
    `;
  }

  async reserveSpend(entry: {
    intentId: string;
    walletId: string;
    usdMicros: bigint;
    capMicros: bigint;
  }): Promise<bigint | null> {
    if (entry.usdMicros < 0n) {
      throw new Error('reserveSpend: usdMicros must be non-negative');
    }
    const day = utcDay(new Date());
    const lockKey = `${entry.walletId}:${day}`;
    try {
      return await this.db.$transaction(async (tx) => {
        // Transaction-scoped serialization for this (wallet, day); the
        // lock cannot leak past COMMIT/ROLLBACK. $executeRaw (not
        // $queryRaw): pg_advisory_xact_lock returns void, which the
        // driver adapter cannot deserialize as a row column.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        await tx.$executeRaw`
          INSERT INTO spend_ledger (wallet_id, utc_day, intent_id, usd_micros, recorded_at)
          VALUES (${entry.walletId}, ${day}, ${entry.intentId}, ${entry.usdMicros}, now())
          ON CONFLICT (wallet_id, utc_day, intent_id)
          DO UPDATE SET usd_micros = EXCLUDED.usd_micros, recorded_at = now()
        `;
        const rows = await tx.$queryRaw<Array<{ total: bigint | string }>>`
          SELECT COALESCE(SUM(usd_micros), 0) AS total
          FROM spend_ledger
          WHERE wallet_id = ${entry.walletId} AND utc_day = ${day}
        `;
        // int8 SUM comes back as STRING through the pg driver adapter —
        // normalize to bigint before ANY comparison (end-to-end micros).
        const total = BigInt(rows[0].total);
        if (total > entry.capMicros) {
          throw CAP_BREACH;
        }
        return total;
      });
    } catch (err) {
      if (err === CAP_BREACH) {
        // ROLLBACK already undid the upsert — nothing was recorded.
        return null;
      }
      throw err;
    }
  }
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
