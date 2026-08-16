import type { FeeBps } from '@kryptr/shared-types';

/**
 * Wave-5 launchpad fee preview — Q1 ruling: the integer-bps mirrors are the
 * SOURCE OF TRUTH for fee arithmetic. Everything here is pure integer math
 * (bps are cents-per-$100); no floats, never a float-equality literal. The
 * float `TokenFeeSchedule` shares stay display/on-chain constructor args and
 * are never used for money math in the frontoffice.
 */

/** Recipient keys in stable display order (frozen `FeeBps` fields). */
export const FEE_RECIPIENT_KEYS = [
  'creator',
  'lp',
  'protocol',
  'buyback',
] as const;
export type FeeRecipientKey = (typeof FEE_RECIPIENT_KEYS)[number];

const RECIPIENT_LABELS: Record<FeeRecipientKey, string> = {
  creator: 'Creator',
  lp: 'Liquidity (locked)',
  protocol: 'Protocol',
  buyback: 'Buyback',
};

/** One preview row: who is paid, in integer bps (cents per $100). */
export interface FeePreviewRow {
  key: FeeRecipientKey;
  label: string;
  bps: number;
}

/**
 * Total launch fee in integer bps. Pure integer addition — the consent
 * screen's "cost per $100" derives from this, never from float shares.
 */
export function totalFeeBps(bps: FeeBps): number {
  return (
    Math.trunc(bps.creator) +
    Math.trunc(bps.lp) +
    Math.trunc(bps.protocol) +
    Math.trunc(bps.buyback)
  );
}

/** Preview rows for all four recipients, stable order. */
export function feePreviewRows(bps: FeeBps): FeePreviewRow[] {
  return FEE_RECIPIENT_KEYS.map((key) => ({
    key,
    label: RECIPIENT_LABELS[key],
    bps: Math.trunc(bps[key]),
  }));
}

/**
 * Format integer bps as dollars-per-$100 ("$1.75"). bps ARE cents per $100,
 * so this is pure integer cent arithmetic — no float multiplication.
 */
export function bpsToDollarsPer100(bps: number): string {
  const cents = Math.abs(Math.trunc(bps));
  const dollars = Math.trunc(cents / 100);
  const remainder = cents % 100;
  const sign = bps < 0 ? '-' : '';
  return `${sign}$${dollars}.${String(remainder).padStart(2, '0')}`;
}

/**
 * Format integer bps as a percent string ("1.75%") via integer arithmetic:
 * 1 bp = 0.01%, so whole part = bps / 100, fraction = bps % 100.
 */
export function bpsToPercent(bps: number): string {
  const scaled = Math.abs(Math.trunc(bps));
  const whole = Math.trunc(scaled / 100);
  const fraction = scaled % 100;
  const sign = bps < 0 ? '-' : '';
  return `${sign}${whole}.${String(fraction).padStart(2, '0')}%`;
}
