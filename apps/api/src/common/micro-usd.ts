import { DomainError } from './domain-error';

/** Integer micro-USD conversion — S1 persistence design §8 (docs/research/wave6-s1-persistence-design.md),
 *  Review54 micro-USD ruling conditions 1–3.
 *
 * Money in the persistence layer is integer micro-USD (1 USD = 1_000_000 µ).
 * Float/decimal USD may only exist at port boundaries (shared-types uses
 * `number`); this module performs the ONE sanctioned conversion with three
 * hard rules:
 *
 * 1. Half-away-from-zero rounding on the DECIMAL value. The forbidden form
 *    `Math.round(usd * 1e6)` multiplies in float first and loses precision
 *    BEFORE rounding (e.g. `1.005 * 1e6 === 1004999.9999999999` → rounds to
 *    1004999, not the decimal-correct 1005000).
 * 2. Float inputs are reconstructed to their 12-digit decimal expansion
 *    first (`toFixed(12)`), so typical monetary inputs like 1.005 keep their
 *    intended decimal value through the conversion.
 * 3. Everything downstream stays in micro-USD bigints — caps, sums, and
 *    comparisons never re-enter floats.
 */

const MICROS_PER_USD = 1_000_000n;
const FLOAT_DECIMALS = 12;
const DECIMAL_USD = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Convert a USD amount (number at the ingestion boundary, or exact decimal
 *  string) to integer micro-USD, half-away-from-zero on the decimal value.
 *  Fails closed on non-finite numbers and malformed strings. */
export function usdToMicros(usd: number | string): bigint {
  const text = typeof usd === 'number' ? numberToDecimalText(usd) : usd.trim();
  if (!DECIMAL_USD.test(text)) {
    throw new DomainError(
      'INVALID_USD_VALUE',
      `usdToMicros: not a finite decimal USD value: ${JSON.stringify(text)}`,
    );
  }

  const negative = text.startsWith('-');
  const unsigned = negative || text.startsWith('+') ? text.slice(1) : text;
  const [intText = '0', fracText = ''] = unsigned.split('.');

  // Round the fraction to exactly 6 digits, half-away-from-zero: the 7th
  // digit decides (>= 5 rounds away from zero); anything beyond the 7th
  // digit can only increase the remainder, so the same test holds.
  const padded = (fracText + '0000000').slice(0, 7);
  let microsFrac = BigInt(padded.slice(0, 6));
  let intPart = BigInt(intText);
  if (Number(padded[6]) >= 5) {
    microsFrac += 1n;
    if (microsFrac === MICROS_PER_USD) {
      microsFrac = 0n;
      intPart += 1n;
    }
  }

  const micros = intPart * MICROS_PER_USD + microsFrac;
  return negative && micros !== 0n ? -micros : micros;
}

/** Exact fixed-point decimal rendering of micro-USD (6 places, no
 *  trimming). Display/evidence only — never parse the result back through
 *  a float; use `usdToMicros` for that. */
export function microsToUsdString(micros: bigint): string {
  const negative = micros < 0n;
  const abs = negative ? -micros : micros;
  const intPart = abs / MICROS_PER_USD;
  const fracPart = (abs % MICROS_PER_USD).toString().padStart(6, '0');
  return `${negative ? '-' : ''}${intPart}.${fracPart}`;
}

function numberToDecimalText(usd: number): string {
  if (!Number.isFinite(usd)) {
    throw new DomainError(
      'INVALID_USD_VALUE',
      `usdToMicros: non-finite USD value: ${usd}`,
    );
  }
  return usd.toFixed(FLOAT_DECIMALS);
}
