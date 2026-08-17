import { Inject, Injectable } from '@nestjs/common';
import type { SecurityDecision, TransactionIntent } from '@kryptr/shared-types';
import { inspectIntentPayload } from '../domain/payload-inspection';
import { validateDeployPreconditions } from '../domain/deploy-preconditions';
import { usdToMicros } from '../../common/micro-usd';
import {
  DECISION_AUDIT,
  DEPLOY_ALLOWLIST,
  INTENT_STORE,
  POLICY_PROVIDER,
  PRICE_FEED,
  SPEND_LEDGER,
  type DecisionAudit,
  type DeployAllowlistPort,
  type IntentStore,
  type PriceFeedPort,
  type SecurityPolicyProvider,
  type SpendLedger,
} from './ports';
import {
  QUOTE_STORE,
  type QuoteStore,
} from '../../trading/domain/quote-store.port';
import {
  VERIFICATION_STORE,
  type VerificationArtifactStore,
} from '../../launchpad/domain/verification-store.port';

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
 *   [wave 5] automation-deploy firewall (BELOW every policy read) ->
 *   policy lookup -> payload inspection -> origin allowlist ->
 *   chain allowlist -> deploy preconditions (kind='deploy', then
 *   unconditional HITL) -> swap-context checks (kind='swap') ->
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
    @Inject(DEPLOY_ALLOWLIST)
    private readonly deployAllowlist: DeployAllowlistPort,
    @Inject(VERIFICATION_STORE)
    private readonly verificationStore: VerificationArtifactStore,
  ) {}

  async execute(intent: TransactionIntent): Promise<SecurityDecision> {
    await this.intentStore.save(intent);

    // Wave-5 firewall layer 1 (launchpad-decision.md condition 3):
    // automation origins can NEVER deploy. This rejection sits BELOW
    // every policy/allowlist read on purpose — the worker's origin must
    // be policy-granted for its swaps, so deploy authorization can never
    // derive from a config grant. Unconditional, permanent (Q4).
    if (intent.kind === 'deploy' && intent.origin.startsWith('automation:')) {
      return this.finish(
        intent,
        null,
        'rejected',
        'automation_deploy_forbidden',
      );
    }
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

    // Wave 3 + wave 5: contract deploys move no value but grant economic
    // control, so USD valuation is meaningless — validate the frozen
    // consent context, then ALWAYS escalate, before pricing. Automation
    // origins never reach here (layer-1 firewall above policy).
    if (intent.kind === 'deploy') {
      const rejectCode = await validateDeployPreconditions(intent, {
        isFactoryAllowed: (chain, factory) =>
          this.deployAllowlist.isAllowed(chain, factory),
        verificationIdFor: (chain, factory) =>
          this.deployAllowlist.verificationIdFor(chain, factory),
        resolveVerification: (id) => this.verificationStore.get(id),
      });
      if (rejectCode !== null) {
        return this.finish(intent, null, 'rejected', rejectCode);
      }
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

    // Wave-6 S1 (persistence design §5.1, Review54 F1): the cap path is an
    // atomic compare-and-reserve in integer micro-USD. reserveSpend checks
    // the cap AND records the spend as one unit (one synchronous tick in
    // the in-memory ledger; pg_advisory_xact_lock inside one pinned
    // connection in Postgres), replacing the KeyedMutex-guarded
    // read-check-record path. Cap math stays end-to-end in micros.
    if (policy.dailyCapUsd <= 0 && valueUsd > 0) {
      return this.finish(
        intent,
        valueUsd,
        'rejected',
        'rejected: daily cap is zero; no outbound value allowed',
      );
    }
    const reserved = await this.spendLedger.reserveSpend({
      intentId: intent.id,
      walletId: intent.walletId,
      usdMicros: usdToMicros(valueUsd),
      capMicros: usdToMicros(policy.dailyCapUsd),
    });
    if (reserved === null) {
      return this.finish(
        intent,
        valueUsd,
        'rejected',
        `rejected: daily cap exceeded (value $${valueUsd.toFixed(
          2,
        )} does not fit under cap $${policy.dailyCapUsd.toFixed(2)})`,
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
   * Finalize a decision. Ordering is security-critical:
   *  1. F2 — non-rejected swaps take the quote's single-use binding
   *     FIRST and honor its result: bind() === false means a concurrent
   *     intent won the quote, so the decision downgrades to rejected.
   *     (A cap reservation already taken by reserveSpend stays consumed
   *     for the day in that race — over-counting is the accepted
   *     fail-safe direction, never under-count.)
   *  2. S1 — approved spend is reserved by the reserveSpend seam BEFORE
   *     finish() runs, so an approved intent can never exist without
   *     consuming the cap; a failed reservation aborts the decision
   *     (fail-closed, F5).
   *  3. The immutable audit entry is appended last (USD fixed at
   *     decision time; ledger dedupe delegated to the SpendLedger port
   *     contract — per UTC day, last decision wins).
   */
  private async finish(
    intent: TransactionIntent,
    decisionUsd: number | null,
    result: SecurityDecision['result'],
    reason: string,
  ): Promise<SecurityDecision> {
    let finalResult = result;
    let finalReason = reason;
    if (intent.kind === 'swap' && intent.swap && finalResult !== 'rejected') {
      const bound = await this.quoteStore.bind(intent.swap.quoteId, intent.id);
      if (!bound) {
        finalResult = 'rejected';
        finalReason = `rejected: quote "${intent.swap.quoteId}" already bound to another intent`;
      }
    }
    const decision: SecurityDecision = {
      intentId: intent.id,
      result: finalResult,
      reason: finalReason,
      decidedAt: new Date().toISOString(),
    };
    await this.decisionAudit.append({
      intentId: intent.id,
      result: finalResult,
      reason: finalReason,
      decidedAt: decision.decidedAt,
      decisionUsd,
    });
    return decision;
  }
}
