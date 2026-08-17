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

  describe('reserveSpend (wave-6 S1 seam: atomic compare-and-reserve in micro-USD)', () => {
    it('reserves within the cap and returns the post-reserve day total', async () => {
      const ledger = new InMemorySpendLedger();
      const total = await ledger.reserveSpend({
        intentId: 'i1',
        walletId: 'wallet-1',
        usdMicros: 25_000_000n,
        capMicros: 100_000_000n,
      });
      expect(total).toBe(25_000_000n);
      await expect(ledger.getSpentUsdToday('wallet-1')).resolves.toBe(25);
    });

    it('returns null and records NOTHING when the reservation would breach the cap', async () => {
      const ledger = new InMemorySpendLedger();
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

    it('cap boundary is inclusive (spent + value == cap fits)', async () => {
      const ledger = new InMemorySpendLedger();
      await ledger.record({ intentId: 'i1', walletId: 'wallet-1', usd: 60 });
      const total = await ledger.reserveSpend({
        intentId: 'i2',
        walletId: 'wallet-1',
        usdMicros: 40_000_000n,
        capMicros: 100_000_000n,
      });
      expect(total).toBe(100_000_000n);
    });

    it('replaces the same intent contribution (last-wins) instead of stacking', async () => {
      const ledger = new InMemorySpendLedger();
      await ledger.record({ intentId: 'i1', walletId: 'wallet-1', usd: 90 });
      // Re-valuation of the SAME intent at $20 must not see its own $90.
      const total = await ledger.reserveSpend({
        intentId: 'i1',
        walletId: 'wallet-1',
        usdMicros: 20_000_000n,
        capMicros: 100_000_000n,
      });
      expect(total).toBe(20_000_000n);
      await expect(ledger.getSpentUsdToday('wallet-1')).resolves.toBe(20);
    });

    it('sums sub-cent values exactly where float arithmetic cannot', async () => {
      const ledger = new InMemorySpendLedger();
      // 0.1 + 0.2 === 0.30000000000000004 in float; micro-USD sums exactly.
      await ledger.reserveSpend({
        intentId: 'a',
        walletId: 'w',
        usdMicros: 100_000n,
        capMicros: 300_000n,
      });
      const total = await ledger.reserveSpend({
        intentId: 'b',
        walletId: 'w',
        usdMicros: 200_000n,
        capMicros: 300_000n,
      });
      expect(total).toBe(300_000n);
    });

    it('keeps wallets separate under reservation', async () => {
      const ledger = new InMemorySpendLedger();
      await ledger.reserveSpend({
        intentId: 'i1',
        walletId: 'wallet-1',
        usdMicros: 99_000_000n,
        capMicros: 100_000_000n,
      });
      const other = await ledger.reserveSpend({
        intentId: 'i1',
        walletId: 'wallet-2',
        usdMicros: 99_000_000n,
        capMicros: 100_000_000n,
      });
      expect(other).toBe(99_000_000n);
    });

    it('fails closed on negative amounts', async () => {
      const ledger = new InMemorySpendLedger();
      await expect(
        ledger.reserveSpend({
          intentId: 'i1',
          walletId: 'wallet-1',
          usdMicros: -1n,
          capMicros: 100n,
        }),
      ).rejects.toThrow();
    });
  });
});
