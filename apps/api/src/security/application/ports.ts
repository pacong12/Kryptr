import type { SecurityPolicy, TransactionIntent } from '@kryptr/shared-types';

/**
 * Ports for the security gate. The use case depends on these interfaces
 * only; implementations live in infrastructure/ and are wired in the
 * module. Wave 2 swaps the stubs for real adapters without touching the
 * decision logic.
 */

export const PRICE_LOOKUP = 'security.price-lookup';
export const DAILY_SPEND = 'security.daily-spend';
export const POLICY_PROVIDER = 'security.policy-provider';

/** USD valuation of an intent. Price data sits behind this port. */
export interface PriceLookup {
  /**
   * Total USD value of the intent's amount, or null when the price is
   * unknown. Null is fail-closed input: the gate escalates to human
   * approval instead of guessing.
   */
  getUsdValue(intent: TransactionIntent): Promise<number | null>;
}

/** How much a wallet already spent today (UTC) in USD. */
export interface DailySpendReader {
  getSpentUsdToday(walletId: string): Promise<number>;
}

/** Where SecurityPolicy objects come from. */
export interface SecurityPolicyProvider {
  getPolicyForWallet(walletId: string): Promise<SecurityPolicy | null>;
  upsert(policy: SecurityPolicy): Promise<void>;
}
