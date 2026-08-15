import { Injectable } from '@nestjs/common';
import type { DailySpendReader } from '../application/ports';

/**
 * In-memory daily spend tracker (Wave 1). Wave 2 replaces this with a
 * persistent ledger derived from ExecutedTransactions; the gate only
 * depends on the DailySpendReader port.
 */
@Injectable()
export class InMemoryDailySpend implements DailySpendReader {
  private readonly spentByWallet = new Map<
    string,
    { day: string; spentUsd: number }
  >();

  async getSpentUsdToday(walletId: string): Promise<number> {
    const entry = this.spentByWallet.get(walletId);
    if (!entry || entry.day !== this.todayKey()) return 0;
    return entry.spentUsd;
  }

  /** Record outbound value once an intent actually executes (Wave 2). */
  record(walletId: string, usd: number): void {
    const today = this.todayKey();
    const entry = this.spentByWallet.get(walletId);
    const spentUsd = entry && entry.day === today ? entry.spentUsd : 0;
    this.spentByWallet.set(walletId, { day: today, spentUsd: spentUsd + usd });
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
