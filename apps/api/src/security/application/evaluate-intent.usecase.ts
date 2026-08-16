import { Inject, Injectable } from '@nestjs/common';
import type { SecurityDecision, TransactionIntent } from '@kryptr/shared-types';
import { inspectIntentPayload } from '../domain/payload-inspection';
import {
  DECISION_AUDIT,
  INTENT_STORE,
  POLICY_PROVIDER,
  PRICE_FEED,
  SPEND_LEDGER,
  type DecisionAudit,
  type IntentStore,
  type PriceFeedPort,
  type SecurityPolicyProvider,
  type SpendLedger,
} from './ports';
import {
  QUOTE_STORE,
  type QuoteStore,
} from '../../trading/domain/quote-store.port';

/**
 * Safety margin before quote expiry: intents bound to a quote that
 * expires within this window are rejected, so an approved decision can
 * actually be acted on.
 */
export const QUOTE_EXPIRY_MARGIN_MS = 5_000;

/**
 * The security gate. The ONLY thing that stands between an intent and
 * (future) signing. Evaluates TransactionIntents against the wallet's
 * SecurityPolicy — including swap-context binding, quote expiry and
 * slippage checks — and produces a SecurityDecision. Every decision is
 * appended to the append-only DecisionAudit with its USD value fixed at
 * decision time. Never signs, never sees a private key.
 *
 * Decision chain (fail-closed):
 *   policy lookup -> payload inspection -> origin allowlist ->
 *   chain allowlist -> swap-context checks (kind='swap') ->
 *   price/valuation -> approval threshold -> daily cap
 */
@Injectable()
export class EvaluateIntentUseCase {
  constructor(
    @Inject(PRICE_FEED) private readonly priceFeed: PriceFeedPort,
    @Inject(SPEND_LEDGER) private readonly spendLedger: SpendLedger,
    @Inject(POLICY_PROVIDER)
    private readonly policyProvider: SecurityPolicyProvider,
    @Inject(INTENT_STORE) private readonly intentStore: IntentStore,
    @Inject(DECISION_AUDIT) private readonly decisionAudit: DecisionAudit,
    @Inject(QUOTE_STORE) private readonly quoteStore: QuoteStore,
  ) {}

  async execute(intent: TransactionIntent): Promise<SecurityDecision> {
    await this.intentStore.save(intent);

    const policy = await this.policyProvider.getPolicyForWallet(
      intent.walletId,
    );
    if (!policy) {
      return this.finish(
        intent,
        null,
        'rejected',
        'rejected: no security policy exists for this wallet; fail closed',
      );
    }

    if (policy.rejectEncodedPayloads) {
      const inspection = inspectIntentPayload(intent);
      if (inspection.suspicious) {
        return this.finish(
          intent,
          null,
          'rejected',
          `rejected: suspicious payload (${inspection.reason})`,
        );
      }
    }

    // Exact-match allowlist ONLY — no prefix/glob matching. Automation
    // origins ('automation:order-worker', wave 4) must be listed
    // explicitly; the default policy denies them fail-closed.
    if (!policy.allowedOrigins.includes(intent.origin)) {
      return this.finish(
        intent,
        null,
        'rejected',
        `rejected: origin "${intent.origin}" is not in the wallet origin allowlist`,
      );
    }

    if (!policy.allowedChains.includes(intent.chain)) {
      return this.finish(
        intent,
        null,
        'rejected',
        `rejected: chain "${intent.chain}" is not in the wallet chain allowlist`,
      );
    }

    // Wave 3: contract deploys move no value but grant economic control,
    // so USD valuation is meaningless — ALWAYS escalate, before pricing.
    if (intent.kind === 'deploy') {
      return this.finish(
        intent,
        null,
        'needs_human_approval',
        'deploy_requires_human_approval',
      );
    }

    if (intent.kind === 'swap') {
      const swapRejection = await this.checkSwapContext(intent);
      if (swapRejection) {
        return this.finish(intent, null, 'rejected', swapRejection);
      }
    }

    const valueUsd = await this.priceFeed.getUsdValue(intent);
    if (valueUsd === null) {
      return this.finish(
        intent,
        null,
        'needs_human_approval',
        'needs_human_approval: USD price unavailable, value cannot be verified',
      );
    }

    if (valueUsd > policy.approvalThresholdUsd) {
      return this.finish(
        intent,
        valueUsd,
        'needs_human_approval',
        `needs_human_approval: value $${valueUsd.toFixed(
          2,
        )} exceeds approval threshold $${policy.approvalThresholdUsd.toFixed(2)}`,
      );
    }

    const spentUsdToday = await this.spendLedger.getSpentUsdToday(
      intent.walletId,
    );
    if (policy.dailyCapUsd <= 0 && valueUsd > 0) {
      return this.finish(
        intent,
        valueUsd,
        'rejected',
        'rejected: daily cap is zero; no outbound value allowed',
      );
    }
    if (spentUsdToday + valueUsd > policy.dailyCapUsd) {
      return this.finish(
        intent,
        valueUsd,
        'rejected',
        `rejected: daily cap exceeded (spent $${spentUsdToday.toFixed(
          2,
        )} + $${valueUsd.toFixed(2)} > cap $${policy.dailyCapUsd.toFixed(2)})`,
      );
    }

    return this.finish(intent, valueUsd, 'approved', 'approved: within policy');
  }

  /**
   * Swap-context checks. Returns a rejection reason, or null when the
   * context is consistent with a live, unbound quote.
   */
  private async checkSwapContext(
    intent: TransactionIntent,
  ): Promise<string | null> {
    const swap = intent.swap;
    if (!swap) {
      return 'rejected: swap intent is missing its swap context';
    }
    const stored = await this.quoteStore.findById(swap.quoteId);
    if (!stored) {
      return `rejected: swap quote "${swap.quoteId}" not found`;
    }
    if (stored.boundIntentId && stored.boundIntentId !== intent.id) {
      return `rejected: swap quote "${swap.quoteId}" is already bound to another intent (single-use)`;
    }
    const quote = stored.quote;
    if (swap.quoteExpiresAt !== quote.expiresAt) {
      return 'rejected: swap context quoteExpiresAt does not match the stored quote';
    }
    if (Date.parse(quote.expiresAt) <= Date.now() + QUOTE_EXPIRY_MARGIN_MS) {
      return 'rejected: swap quote expired (or expires within the safety margin)';
    }
    if (quote.slippageBps > swap.maxSlippageBps) {
      return `rejected: quote slippage ${quote.slippageBps}bps exceeds the allowed ${swap.maxSlippageBps}bps`;
    }
    if (swap.minBuyAmount !== quote.minAmountOut) {
      return 'rejected: swap context min buy amount does not match the quote floor';
    }
    if (intent.asset !== quote.assetIn || intent.amount !== quote.amountIn) {
      return 'rejected: swap intent sell side does not match the bound quote';
    }
    return null;
  }

  /**
   * Finalize a decision: append the immutable audit entry (USD fixed at
   * decision time), record approved spend against the daily cap
   * (idempotent per intentId — re-evaluating the same intent never
   * double-counts), and — for non-rejected swaps — take the quote's
   * single-use binding.
   */
  private async finish(
    intent: TransactionIntent,
    decisionUsd: number | null,
    result: SecurityDecision['result'],
    reason: string,
  ): Promise<SecurityDecision> {
    const decision: SecurityDecision = {
      intentId: intent.id,
      result,
      reason,
      decidedAt: new Date().toISOString(),
    };
    await this.decisionAudit.append({
      intentId: intent.id,
      result,
      reason,
      decidedAt: decision.decidedAt,
      decisionUsd,
    });
    if (result === 'approved' && decisionUsd !== null) {
      await this.spendLedger.record({
        intentId: intent.id,
        walletId: intent.walletId,
        usd: decisionUsd,
      });
    }
    if (intent.kind === 'swap' && intent.swap && result !== 'rejected') {
      await this.quoteStore.bind(intent.swap.quoteId, intent.id);
    }
    return decision;
  }
}
