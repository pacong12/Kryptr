/** Presentation helpers shared by dashboard views. Pure and deterministic. */

/** '2026-02-19T11:42:00.000Z' -> '2026-02-19 11:42 UTC' (hydration-safe). */
export function formatDateTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** 90061 -> '1d 1h 1m 1s' */
export function formatUptime(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return '0s';
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

/** '0x4a3f9c21d8b7e6a50c1d2e3f4a5b6c7d8e9f0a1b' -> '0x4a3f…0a1b' */
export function shortenHex(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/** 'pending_approval' -> 'pending approval' */
export function humanize(slug: string): string {
  return slug.replaceAll('_', ' ');
}

/**
 * Raw integer units -> decimal string using BigInt (wei-scale safe):
 * ('1200000000000000000', 18) -> '1.2'. Trailing zeros are trimmed.
 */
export function formatUnits(amount: string, decimals: number): string {
  const raw = BigInt(amount);
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = (raw % base)
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '');
  return frac === '' ? whole.toString() : `${whole}.${frac}`;
}
