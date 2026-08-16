import { describe, expect, it } from 'vitest';
import type { FeeBps } from '@kryptr/shared-types';
import {
  bpsToDollarsPer100,
  bpsToPercent,
  FEE_RECIPIENT_KEYS,
  feePreviewRows,
  totalFeeBps,
} from './feePreview';

/** Reference split: integer bps mirrors summing to the 175-bps launch fee. */
const REFERENCE_BPS: FeeBps = {
  creator: 67,
  lp: 28,
  protocol: 47,
  buyback: 33,
};

describe('launchpad fee preview (integer-only arithmetic)', () => {
  it('totals the integer bps mirrors', () => {
    expect(totalFeeBps(REFERENCE_BPS)).toBe(175);
    expect(totalFeeBps({ creator: 0, lp: 0, protocol: 0, buyback: 0 })).toBe(0);
  });

  it('formats cost-per-$100 from integer cents — no float drift', () => {
    // 175 bps = 175 cents per $100 = $1.75 exactly.
    expect(bpsToDollarsPer100(175)).toBe('$1.75');
    expect(bpsToDollarsPer100(67)).toBe('$0.67');
    expect(bpsToDollarsPer100(5)).toBe('$0.05');
    expect(bpsToDollarsPer100(0)).toBe('$0.00');
    expect(bpsToDollarsPer100(10_000)).toBe('$100.00');
  });

  it('formats percentages from integer bps — no float drift', () => {
    expect(bpsToPercent(175)).toBe('1.75%');
    expect(bpsToPercent(67)).toBe('0.67%');
    expect(bpsToPercent(5)).toBe('0.05%');
    expect(bpsToPercent(0)).toBe('0.00%');
  });

  it('produces one row per frozen recipient key, stable order', () => {
    const rows = feePreviewRows(REFERENCE_BPS);
    expect(rows.map((row) => row.key)).toEqual([...FEE_RECIPIENT_KEYS]);
    expect(rows[0]).toEqual({ key: 'creator', label: 'Creator', bps: 67 });
    expect(rows.reduce((sum, row) => sum + row.bps, 0)).toBe(175);
  });
});
