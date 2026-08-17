import type { SpendLedger } from '../application/ports';
import { usdToMicros } from '../../common/micro-usd';

/**
 * In-memory daily spend ledger. Spend is keyed (wallet, UTC day,
 * intentId): re-confirmation within the same UTC day never
 * double-counts and the last value wins; a re-approval on a later day
 * records again for that day (over-count fail-safe, see port contract).
 *
 * Wave-6 S1: amounts are stored as integer micro-USD internally (the
 * persistence-layer money representation); the float port surface is
 * converted at the boundary via usdToMicros. Replaced by the
 * Postgres-backed ledger (persistence design §5.1) for multi-replica
 * atomicity — this class remains the hermetic-test implementation.
 */
export class InMemorySpendLedger implements SpendLedger {
  /** walletId -> utcDay -> intentId -> micro-USD. */
  private readonly spend = new Map<string, Map<string, Map<string, bigint>>>();

  async getSpentUsdToday(walletId: string): Promise<number> {
    const entries = this.spend.get(walletId)?.get(this.utcDay(new Date()));
    if (!entries) {
      return 0;
    }
    let totalMicros = 0n;
    for (const micros of entries.values()) {
      totalMicros += micros;
    }
    return Number(totalMicros) / 1_000_000;
  }

  async record(entry: {
    intentId: string;
    walletId: string;
    usd: number;
  }): Promise<void> {
    this.put(entry.walletId, entry.intentId, usdToMicros(entry.usd));
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
    // Single-process atomicity: the read-check-write below runs in ONE
    // synchronous tick (no await between steps) — the in-memory analogue
    // of pg_advisory_xact_lock serialization in the Postgres adapter.
    const day = this.utcDay(new Date());
    const byDay = this.spend.get(entry.walletId)?.get(day);
    let othersMicros = 0n;
    if (byDay) {
      for (const [intentId, micros] of byDay) {
        if (intentId !== entry.intentId) {
          othersMicros += micros;
        }
      }
    }
    const candidate = othersMicros + entry.usdMicros;
    if (candidate > entry.capMicros) {
      return null;
    }
    this.put(entry.walletId, entry.intentId, entry.usdMicros);
    return candidate;
  }

  private put(walletId: string, intentId: string, micros: bigint): void {
    const day = this.utcDay(new Date());
    let byWallet = this.spend.get(walletId);
    if (!byWallet) {
      byWallet = new Map();
      this.spend.set(walletId, byWallet);
    }
    let byDay = byWallet.get(day);
    if (!byDay) {
      byDay = new Map();
      byWallet.set(day, byDay);
    }
    byDay.set(intentId, micros);
  }

  private utcDay(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
