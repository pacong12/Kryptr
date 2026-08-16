import type {
  ChainId,
  FeedHealth,
  SecurityPolicy,
  TransactionIntent,
} from '@kryptr/shared-types';

/**
 * Ports for the security gate (wave 2). The use case depends on these
 * interfaces only; implementations live in infrastructure/ and are wired
 * in the module. Shapes are Postgres-ready so the persistence task can
 * swap implementations without touching the decision logic.
 */

export const PRICE_FEED = 'security.price-feed';
export const SPEND_LEDGER = 'security.spend-ledger';
export const POLICY_PROVIDER = 'security.policy-provider';
export const INTENT_STORE = 'security.intent-store';
export const DECISION_AUDIT = 'security.decision-audit';
export const DEPLOY_ALLOWLIST = 'security.deploy-allowlist';

/**
 * USD valuation and spot prices. Fail-closed contract: null means
 * "unknown" and the gate escalates to human approval — never a silent
 * pass.
 */
export interface PriceFeedPort {
  /** USD price of one WHOLE unit; null = unknown. */
  getSpotPrice(
    chain: ChainId,
    asset: `0x${string}` | null,
  ): Promise<number | null>;
  /** Total USD value of the intent's amount, or null when unknown. */
  getUsdValue(intent: TransactionIntent): Promise<number | null>;
  /** Freshness for GET /health/feeds. */
  health(): FeedHealth;
}

/**
 * Daily spend per wallet. Entries are keyed by (walletId, UTC day,
 * intentId); re-confirmation within the same UTC day never
 * double-counts, and the LAST recorded value wins per intentId.
 */
export interface SpendLedger {
  getSpentUsdToday(walletId: string): Promise<number>;
  /**
   * Idempotent per (walletId, UTC day, intentId) — NOT globally: a
   * re-approval on a LATER day records again for that day. Over-counting
   * across days is the accepted fail-safe direction (never under-count).
   */
  record(entry: {
    intentId: string;
    walletId: string;
    usd: number;
  }): Promise<void>;
}

/** Where SecurityPolicy objects come from. */
export interface SecurityPolicyProvider {
  getPolicyForWallet(walletId: string): Promise<SecurityPolicy | null>;
  upsert(policy: SecurityPolicy): Promise<void>;
}

/** Evaluated intents are stored so timeline/preview can reference them. */
export interface IntentStore {
  save(intent: TransactionIntent): Promise<void>;
  findById(id: string): Promise<TransactionIntent | null>;
}

/**
 * Append-only decision log. decisionUsd is fixed at decision time so cap
 * accounting and forensics never depend on re-pricing.
 */
export interface DecisionAuditEntry {
  id: string;
  intentId: string;
  result: 'approved' | 'needs_human_approval' | 'rejected';
  reason: string;
  /** ISO-8601. */
  decidedAt: string;
  /** USD value used for the decision; null when unknown or rejected early. */
  decisionUsd: number | null;
}

/**
 * Signer activity recorded as timeline steps (wave 3). Kept in the same
 * append-only audit so the backoffice timeline stays a single source.
 */
export type SignEventStep = 'sign_requested' | 'dry_run_signed';

export interface SignEventEntry {
  id: string;
  intentId: string;
  step: SignEventStep;
  detail: string;
  /** ISO-8601. */
  at: string;
}

export interface DecisionAudit {
  append(entry: Omit<DecisionAuditEntry, 'id'>): Promise<DecisionAuditEntry>;
  /** Append-only: entries are immutable once written. */
  findByIntentId(intentId: string): Promise<DecisionAuditEntry[]>;
  appendSignEvent(entry: Omit<SignEventEntry, 'id'>): Promise<SignEventEntry>;
  findSignEventsByIntentId(intentId: string): Promise<SignEventEntry[]>;
}

/**
 * Wave-5 layer-2 factory allowlist (launchpad-decision.md condition 3).
 * Config surface by design — but it can only RESTRICT interactive
 * deploys, never enable automation ones (the layer-1 firewall rejects
 * automation deploys below every policy/allowlist read). Fail-closed
 * contract: false means "not allowlisted"; empty manifests keep the
 * launchpad dark.
 */
export interface DeployAllowlistPort {
  isAllowed(chain: ChainId, factory: `0x${string}`): boolean;
}
