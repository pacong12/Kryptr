import type { SpendLedger } from '../application/ports';

/**
 * In-memory daily spend ledger. Spend is keyed (wallet, UTC day,
 * intentId): re-confirmation within the same UTC day never
 * double-counts and the last value wins; a re-approval on a later day
 * records again for that day (over-count fail-safe, see port contract).
 * Replaced by the Postgres-backed ledger in the persistence task.
 */
export class InMemorySpendLedger implements SpendLedger {
  /** walletId -> utcDay -> intentId -> USD. */
  private readonly spend = new Map<string, Map<string, Map<string, number>>>();

  async getSpentUsdToday(walletId: string): Promise<number> {
    const day = this.utcDay(new Date());
    const entries = this.spend.get(walletId)?.get(day);
    if (!entries) {
      return 0;
    }
    let total = 0;
    for (const usd of entries.values()) {
      total += usd;
    }
    return total;
  }

  async record(entry: {
    intentId: string;
    walletId: string;
    usd: number;
  }): Promise<void> {
    const day = this.utcDay(new Date());
    let byWallet = this.spend.get(entry.walletId);
    if (!byWallet) {
      byWallet = new Map();
      this.spend.set(entry.walletId, byWallet);
    }
    let byDay = byWallet.get(day);
    if (!byDay) {
      byDay = new Map();
      byWallet.set(day, byDay);
    }
    byDay.set(entry.intentId, entry.usd);
  }

  private utcDay(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
