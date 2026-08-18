import type { TokenFeeSchedule } from '@kryptr/shared-types';

/**
 * Venue pool creation result — virtual result placeholder until S3 rehearsal + Tier D PASS
 */
export interface VirtualPoolResult {
  venueId: string;
  poolAddress: `0x${string}`;
  isLive: false; // Becomes true after S3 rehearsal + Tier D completion
  accruedAt: string;
}

/**
 * Venue accrual snapshot per INV-VENUE-1 theorem (§8.1)
 * Uses exact floor math per §4.5.1 INV-FEE-4 rate identity
 */
export interface VenueAccrualSnapshot {
  tradeAmount: bigint;
  venueShareBps: number;
  venueAccrualWei: bigint; // Calculated as: floor(trade_amount × venueBps / 10_000) EXACT
  baseFeeAccrualsWei: bigint[]; // Schedule recipients unaffected (two-ledger separation)
  calculatedAt: string;
}

/**
 * Graduation status — future logic when S4 criteria defined
 */
export enum GraduationStatus {
  NOT_APPLICABLE = 'not_applicable',
  PENDING = 'pending',
  GRADUATED = 'graduated',
  FAILED = 'failed',
}

/** Injection key for ZeroExVenueAdapter provider */
export const ZERO_EX_VENUE_ADAPTER = Symbol('ZERO_EX_VENUE_ADAPTER');
