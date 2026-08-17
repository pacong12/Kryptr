import { DomainError } from './domain-error';
import { microsToUsdString, usdToMicros } from './micro-usd';

describe('usdToMicros (S1 §8: half-away-from-zero on decimal values, no Math.round(usd*1e6))', () => {
  it('converts whole and typical fractional USD exactly', () => {
    expect(usdToMicros(0)).toBe(0n);
    expect(usdToMicros(1)).toBe(1_000_000n);
    expect(usdToMicros('1')).toBe(1_000_000n);
    expect(usdToMicros(1.5)).toBe(1_500_000n);
    expect(usdToMicros('0.000001')).toBe(1n);
    expect(usdToMicros('12.34')).toBe(12_340_000n);
    expect(usdToMicros('+2.25')).toBe(2_250_000n);
    expect(usdToMicros('.5')).toBe(500_000n);
    expect(usdToMicros('7.')).toBe(7_000_000n);
  });

  it('rounds half AWAY from zero on the decimal value (both directions)', () => {
    // 7th decimal digit == 5 → round away from zero
    expect(usdToMicros('0.0000005')).toBe(1n);
    expect(usdToMicros('-0.0000005')).toBe(-1n);
    expect(usdToMicros('1.0000005')).toBe(1_000_001n);
    expect(usdToMicros('-1.0000005')).toBe(-1_000_001n);
    // beyond half also rounds away from zero
    expect(usdToMicros('0.0000006')).toBe(1n);
    expect(usdToMicros('0.0000004')).toBe(0n);
    expect(usdToMicros('-0.0000006')).toBe(-1n);
  });

  it('recovers the intended decimal value from float artifacts', () => {
    // 0.1 + 0.2 = 0.30000000000000004 as float → decimal-correct 300000 µ
    expect(usdToMicros(0.1 + 0.2)).toBe(300_000n);
    // 1.005 as a float is 1.00499999999999989…; Math.round(1.005 * 1e6)
    // would give 1004999 — the float multiplication is precisely what is
    // forbidden. The decimal value 1.005 must yield 1005000.
    expect(usdToMicros(1.005)).toBe(1_005_000n);
    expect(usdToMicros(2.675)).toBe(2_675_000n);
  });

  it('handles carry across the decimal point and large values', () => {
    expect(usdToMicros('9.9999999')).toBe(10_000_000n);
    expect(usdToMicros('-9.9999999')).toBe(-10_000_000n);
    expect(usdToMicros('999999999999.9999995')).toBe(
      1_000_000_000_000_000_000n,
    );
  });

  it('treats negative zero as zero', () => {
    expect(usdToMicros('-0')).toBe(0n);
    expect(usdToMicros(-0)).toBe(0n);
  });

  it('fails closed on non-finite and malformed input', () => {
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(() => usdToMicros(bad)).toThrow(DomainError);
    }
    for (const bad of [
      '',
      'abc',
      '1e3',
      '1,000',
      '0x1',
      '1.2.3',
      '--1',
      '1 USD',
    ]) {
      expect(() => usdToMicros(bad)).toThrow(DomainError);
    }
  });
});

describe('microsToUsdString', () => {
  it('renders exact fixed-point decimals without float round-trips', () => {
    expect(microsToUsdString(0n)).toBe('0.000000');
    expect(microsToUsdString(1n)).toBe('0.000001');
    expect(microsToUsdString(1_005_000n)).toBe('1.005000');
    expect(microsToUsdString(-1n)).toBe('-0.000001');
    expect(microsToUsdString(1_000_000_000_000_000_000n)).toBe(
      '1000000000000.000000',
    );
  });

  it('round-trips with usdToMicros on exact decimal inputs', () => {
    const cases: Array<[string, string]> = [
      ['0', '0.000000'],
      ['1', '1.000000'],
      ['-1', '-1.000000'],
      ['0.000001', '0.000001'],
      ['123.456789', '123.456789'],
      ['999999999.999999', '999999999.999999'],
      ['1.0000004', '1.000000'],
      ['1.0000005', '1.000001'],
    ];
    for (const [input, expected] of cases) {
      expect(microsToUsdString(usdToMicros(input))).toBe(expected);
    }
  });
});
