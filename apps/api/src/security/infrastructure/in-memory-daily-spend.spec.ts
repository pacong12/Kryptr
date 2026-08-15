import { InMemoryDailySpend } from './in-memory-daily-spend';

describe('InMemoryDailySpend', () => {
  it('starts at zero for unknown wallets', async () => {
    const tracker = new InMemoryDailySpend();
    await expect(tracker.getSpentUsdToday('wallet-1')).resolves.toBe(0);
  });

  it('accumulates recorded spend for the day', async () => {
    const tracker = new InMemoryDailySpend();
    tracker.record('wallet-1', 10.5);
    tracker.record('wallet-1', 4);
    await expect(tracker.getSpentUsdToday('wallet-1')).resolves.toBe(14.5);
  });

  it('keeps wallets separate', async () => {
    const tracker = new InMemoryDailySpend();
    tracker.record('wallet-1', 10);
    await expect(tracker.getSpentUsdToday('wallet-2')).resolves.toBe(0);
  });

  it('resets when the UTC day rolls over', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-05-01T23:00:00.000Z'));
      const tracker = new InMemoryDailySpend();
      tracker.record('wallet-1', 50);
      jest.setSystemTime(new Date('2026-05-02T01:00:00.000Z'));
      await expect(tracker.getSpentUsdToday('wallet-1')).resolves.toBe(0);
      tracker.record('wallet-1', 5);
      await expect(tracker.getSpentUsdToday('wallet-1')).resolves.toBe(5);
    } finally {
      jest.useRealTimers();
    }
  });
});
