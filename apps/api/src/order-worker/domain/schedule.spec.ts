import { dcaSlotFor, isoDurationToMs } from './schedule';

describe('isoDurationToMs', () => {
  it.each([
    ['P1D', 86_400_000],
    ['PT1H', 3_600_000],
    ['PT30M', 1_800_000],
    ['PT45S', 45_000],
    ['P1W', 7 * 86_400_000],
    ['P2DT6H', 2 * 86_400_000 + 6 * 3_600_000],
    ['P1WT12H', 7 * 86_400_000 + 12 * 3_600_000],
  ])('parses %s', (iso, ms) => {
    expect(isoDurationToMs(iso)).toBe(ms);
  });

  it.each(['P', 'PT', '', '1D', 'P1Y', 'p1d', 'P1DT'])(
    'rejects %j',
    (iso) => {
      expect(isoDurationToMs(iso)).toBeNull();
    },
  );
});

describe('dcaSlotFor', () => {
  const anchor = Date.parse('2026-05-01T10:00:00.000Z');
  const hour = 3_600_000;

  it('maps now to the covering slot with an ISO start key', () => {
    const slot = dcaSlotFor({
      createdAtMs: anchor,
      intervalMs: hour,
      nowMs: anchor + 2.5 * hour,
    });
    expect(slot.slotStartMs).toBe(anchor + 2 * hour);
    expect(slot.slotKey).toBe('2026-05-01T12:00:00.000Z');
  });

  it('the first slot starts at the anchor (immediately eligible)', () => {
    const slot = dcaSlotFor({ createdAtMs: anchor, intervalMs: hour, nowMs: anchor });
    expect(slot.slotStartMs).toBe(anchor);
    expect(slot.slotKey).toBe('2026-05-01T10:00:00.000Z');
  });

  it('is deterministic: same inputs, same key (restart-safe)', () => {
    const a = dcaSlotFor({ createdAtMs: anchor, intervalMs: hour, nowMs: anchor + 5 * hour + 7 });
    const b = dcaSlotFor({ createdAtMs: anchor, intervalMs: hour, nowMs: anchor + 5 * hour + 999 });
    expect(a.slotKey).toBe(b.slotKey);
  });

  it('never goes negative before the anchor', () => {
    const slot = dcaSlotFor({ createdAtMs: anchor, intervalMs: hour, nowMs: anchor - 10 });
    expect(slot.slotStartMs).toBe(anchor);
  });
});
