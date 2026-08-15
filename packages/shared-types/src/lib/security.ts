import type { ChainId } from './chains.js';

/**
 * Security policy applied to every TransactionIntent BEFORE signing.
 * Lessons from the Bankr/Grok incident (May 2026):
 * - never trust instruction source by default (source allowlist)
 * - enforce spend caps and require human approval above thresholds
 * - reject non-standard encodings at the ingestion boundary
 */
export interface SecurityPolicy {
  walletId: string;
  /** Origins allowed to create intents for this wallet. */
  allowedOrigins: string[];
  /** Max value per transaction (USD) before human approval is required. */
  approvalThresholdUsd: number;
  /** Hard daily spend cap in USD; 0 = no outbound. */
  dailyCapUsd: number;
  /** Chains this wallet may transact on. */
  allowedChains: ChainId[];
  /** Reject intents whose payload contains encoded/obfuscated instructions. */
  rejectEncodedPayloads: boolean;
}

export const SECURITY_CHECK_RESULTS = [
  'approved',
  'needs_human_approval',
  'rejected',
] as const;
export type SecurityCheckResult = (typeof SECURITY_CHECK_RESULTS)[number];

export interface SecurityDecision {
  intentId: string;
  result: SecurityCheckResult;
  reason: string;
  decidedAt: string;
}
