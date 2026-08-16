import type { ChainId } from './chains.js';
import type { SwapContext } from './trading.js';

export const TX_STATUSES = [
  'pending_approval',
  'queued',
  'submitted',
  'confirmed',
  'failed',
  'rejected',
] as const;
export type TransactionStatus = (typeof TX_STATUSES)[number];

/**
 * A transaction intent is the ONLY thing an AI/agent layer may produce.
 * It is a structured request; execution always requires passing the
 * security gate (see SecurityPolicy). Plain natural-language output must
 * never be mapped directly to a signed transaction.
 */
export interface TransactionIntent {
  id: string;
  walletId: string;
  chain: ChainId;
  kind: 'transfer' | 'swap' | 'deploy' | 'approve';
  to: `0x${string}` | null;
  asset: `0x${string}` | null;
  /** Raw units as string. */
  amount: string;
  /** Who/what originated the intent: 'user' | 'agent:<id>' | 'automation:<id>'. */
  origin: string;
  /** Present iff kind === 'swap'; binds the intent to one quote. */
  swap?: SwapContext;
  createdAt: string;
}

export interface ExecutedTransaction {
  intentId: string;
  txHash: `0x${string}`;
  chain: ChainId;
  status: TransactionStatus;
  /** Who approved execution (user signature or policy rule id). */
  approvedBy: string;
  submittedAt: string;
  confirmedAt: string | null;
}

/**
 * One lifecycle step of an intent, for the backoffice timeline view
 * (GET /api/security/intents/:id/timeline).
 */
export interface IntentTimelineStep {
  /** e.g. 'created' | 'quoted' | 'gate_decision' | 'submitted' | 'confirmed' | 'failed'. */
  step: string;
  /** ISO-8601. */
  at: string;
  /** e.g. 'user' | 'agent:<id>' | 'gate' | 'system'. */
  actor: string;
  detail?: string;
}
