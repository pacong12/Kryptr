import { describePostgres } from '../../test/env-gate';
import {
  disconnectTestClient,
  makePostgresTestClient,
  truncateAllTables,
} from '../../test/postgres-harness';
import { PostgresSpendLedger } from './postgres-spend-ledger';
import type { PrismaClient } from '../../generated/prisma/client';

/**
 * PostgresSpendLedger integration (wave-6 S1 §5.1). Gated on DATABASE_URL —
 * hermetic CI skips; coordinated Postgres CI (OpsCI) provides the DB.
 *
 * The provability criterion from the design, verbatim: N concurrent racers
 * (SEPARATE connections, distinct intents, same wallet/day) whose total
 * exceeds the cap admit EXACTLY the largest prefix that fits — with zero
 * double-counting and zero lost reservations for admitted intents.
 */
describePostgres('PostgresSpendLedger (S1 §5.1, live Postgres)', () => {
  let db: PrismaClient;
  let ledger: PostgresSpendLedger;

  beforeEach(async () => {
    db = makePostgresTestClient();
    await truncateAllTables(db);
    ledger = new PostgresSpendLedger(db);
  });

  afterEach(async () => {
    await disconnectTestClient(db);
  });

  it('records and sums spend in integer micro-USD', async () => {
    await ledger.record({ intentId: 'i1', walletId: 'wallet-1', usd: 10.5 });
    await ledger.record({ intentId: 'i2', walletId: 'wallet-1', usd: 4 });
    await expect(ledger.getSpentUsdToday('wallet-1')).resolves.toBe(14.5);
  });

  it('is idempotent per intent id (last-wins upsert)', async () => {
    await ledger.record({ intentId: 'i1', walletId: 'wallet-1', usd: 10 });
    await ledger.record({ intentId: 'i1', walletId: 'wallet-1', usd: 20 });
    await expect(ledger.getSpentUsdToday('wallet-1')).resolves.toBe(20);
  });

  it('rejects a reservation that would breach the cap and records nothing', async () => {
    await ledger.record({ intentId: 'i1', walletId: 'wallet-1', usd: 96 });
    const total = await ledger.reserveSpend({
      intentId: 'i2',
      walletId: 'wallet-1',
      usdMicros: 5_000_000n,
      capMicros: 100_000_000n,
    });
    expect(total).toBeNull();
    await expect(ledger.getSpentUsdToday('wallet-1')).resolves.toBe(96);
  });

  it('cap boundary is inclusive and the total is exact in micros', async () => {
    await ledger.record({ intentId: 'i1', walletId: 'wallet-1', usd: 60 });
    const total = await ledger.reserveSpend({
      intentId: 'i2',
      walletId: 'wallet-1',
      usdMicros: 40_000_000n,
      capMicros: 100_000_000n,
    });
    expect(total).toBe(100_000_000n);
  });

  it('re-reservation for the SAME intent replaces its own contribution', async () => {
    await ledger.record({ intentId: 'i1', walletId: 'wallet-1', usd: 90 });
    const total = await ledger.reserveSpend({
      intentId: 'i1',
      walletId: 'wallet-1',
      usdMicros: 20_000_000n,
      capMicros: 100_000_000n,
    });
    expect(total).toBe(20_000_000n);
  });

  it('S1 §5.1 provability: N concurrent racers on separate connections admit exactly the prefix that fits', async () => {
    // 10 racers x $20 against a $100 cap → EXACTLY 5 admitted, sum == cap.
    // Each racer gets its OWN Prisma client (own pg pool) → genuinely
    // separate backends, the READ COMMITTED race the advisory lock must
    // arbitrate.
    const RACERS = 10;
    const EACH = 20_000_000n;
    const CAP = 100_000_000n;
    const clients: PrismaClient[] = [];
    try {
      const results = await Promise.all(
        Array.from({ length: RACERS }, (_, i) => {
          const client = makePostgresTestClient();
          clients.push(client);
          const racer = new PostgresSpendLedger(client);
          return racer.reserveSpend({
            intentId: `racer-${i}`,
            walletId: 'hot-wallet',
            usdMicros: EACH,
            capMicros: CAP,
          });
        }),
      );
      const admitted = results.filter((r) => r !== null);
      expect(admitted).toHaveLength(5);
      // Every admitted racer saw a distinct, strictly increasing post-reserve
      // total — the lock fully serialized the wallet/day unit.
      const totals = (admitted as bigint[]).sort((a, b) => (a < b ? -1 : 1));
      expect(totals).toEqual([
        20_000_000n,
        40_000_000n,
        60_000_000n,
        80_000_000n,
        100_000_000n,
      ]);
      await expect(
        new PostgresSpendLedger(db).getSpentUsdToday('hot-wallet'),
      ).resolves.toBe(100);
    } finally {
      await Promise.all(clients.map((c) => disconnectTestClient(c)));
    }
  }, 60_000);

  it('different wallets never contend (lock granularity = wallet+day)', async () => {
    const a = await ledger.reserveSpend({
      intentId: 'i1',
      walletId: 'wallet-A',
      usdMicros: 90_000_000n,
      capMicros: 100_000_000n,
    });
    const b = await ledger.reserveSpend({
      intentId: 'i1',
      walletId: 'wallet-B',
      usdMicros: 90_000_000n,
      capMicros: 100_000_000n,
    });
    expect(a).toBe(90_000_000n);
    expect(b).toBe(90_000_000n);
  });
});
