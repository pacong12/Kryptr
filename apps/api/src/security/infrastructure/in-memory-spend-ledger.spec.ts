import { InMemorySpendLedger } from './in-memory-spend-ledger';

describe('InMemorySpendLedger', () => {
  it('starts at zero for unknown wallets', async () => {
    const ledger = new InMemorySpendLedger();
    await expect(ledger.getSpentUsdToday('wallet-1')).resolves.toBe(0);
  });

  it('accumulates recorded spend per wallet per day', async () => {
    const ledger = new InMemorySpendLedger();
    await ledger.record({ intentId: 'i1', walletId: 'wallet-1', usd: 10.5 });
    await ledger.record({ intentId: 'i2', walletId: 'wallet-1', usd: 4 });
    await expect(ledger.getSpentUsdToday('wallet-1')).resolves.toBe(14.5);
  });

  it('is idempotent per intent id (re-confirmation never double-counts)', async () => {
    const ledger = new InMemorySpendLedger();
    await ledger.record({ intentId: 'i1', walletId: 'wallet-1', usd: 10 });
    await ledger.record({ intentId: 'i1', walletId: 'wallet-1', usd: 10 });
    await expect(ledger.getSpentUsdToday('wallet-1')).resolves.toBe(10);
  });

  it('keeps wallets separate', async () => {
    const ledger = new InMemorySpendLedger();
    await ledger.record({ intentId: 'i1', walletId: 'wallet-1', usd: 10 });
    await expect(ledger.getSpentUsdToday('wallet-2')).resolves.toBe(0);
  });

  it('resets when the UTC day rolls over', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-05-01T23:00:00.000Z'));
      const ledger = new InMemorySpendLedger();
      await ledger.record({ intentId: 'i1', walletId: 'wallet-1', usd: 50 });
      jest.setSystemTime(new Date('2026-05-02T01:00:00.000Z'));
      await expect(ledger.getSpentUsdToday('wallet-1')).resolves.toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
