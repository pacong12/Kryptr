import type { ChainId } from '@kryptr/shared-types';

/** Display labels for supported chains (UI metadata only). */
export const CHAIN_LABELS: Record<ChainId, string> = {
  base: 'Base',
  'robinhood-chain': 'Robinhood Chain',
  ethereum: 'Ethereum',
  arbitrum: 'Arbitrum',
  polygon: 'Polygon',
  solana: 'Solana',
};

/** Native token symbol per chain (UI metadata only). */
export const NATIVE_SYMBOLS: Record<ChainId, string> = {
  base: 'ETH',
  'robinhood-chain': 'RBH',
  ethereum: 'ETH',
  arbitrum: 'ETH',
  polygon: 'POL',
  solana: 'SOL',
};

/** Native balances are carried as wei-equivalent raw units (18 decimals). */
export const NATIVE_DECIMALS = 18;

/**
 * Convert raw integer units (string, e.g. wei) to a display string with up
 * to 6 fraction digits. Never throws: malformed input renders as "0".
 */
export function formatUnits(raw: string, decimals: number): string {
  let value: bigint;
  try {
    value = BigInt(raw);
  } catch {
    return '0';
  }
  const negative = value < 0n;
  if (negative) {
    value = -value;
  }
  const base = 10n ** BigInt(decimals);
  const whole = (value / base).toString();
  const fraction = (value % base)
    .toString()
    .padStart(decimals, '0')
    .slice(0, 6)
    .replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

/**
 * Parse a decimal display string ("1.5") into raw integer units.
 * Returns null when the input is malformed or has more than `decimals`
 * fraction digits (silent precision loss is never acceptable for value
 * transfers).
 */
export function parseUnits(value: string, decimals: number): bigint | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const fraction = match[2] ?? '';
  if (fraction.length > decimals) {
    return null;
  }
  const whole = BigInt(match[1]);
  const fractionUnits = BigInt(fraction.padEnd(decimals, '0') || '0');
  return whole * 10n ** BigInt(decimals) + fractionUnits;
}

/** Shorten an address for display: 0x1234…abcd. */
export function shortAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Deterministic UTC timestamp for display (test-stable, locale-safe). */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
