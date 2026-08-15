import { Inject, Injectable } from '@nestjs/common';
import type { SecurityDecision, TransactionIntent } from '@kryptr/shared-types';
import { inspectIntentPayload } from '../domain/payload-inspection';
import {
  DAILY_SPEND,
  POLICY_PROVIDER,
  PRICE_LOOKUP,
  type DailySpendReader,
  type PriceLookup,
  type SecurityPolicyProvider,
} from './ports';

/**
 * The security gate. This is the ONLY thing that stands between an intent
 * and (future) signing. It evaluates TransactionIntents against a wallet's
 * SecurityPolicy and produces a SecurityDecision. It never signs and never
 * sees a private key — and no other module may bypass it.
 *
 * Decision chain (fail-closed, mission order):
 *   policy lookup -> payload inspection -> origin allowlist ->
 *   chain allowlist -> price/valuation -> approval threshold -> daily cap
 */
@Injectable()
export class EvaluateIntentUseCase {
  constructor(
    @Inject(PRICE_LOOKUP) private readonly priceLookup: PriceLookup,
    @Inject(DAILY_SPEND) private readonly dailySpend: DailySpendReader,
    @Inject(POLICY_PROVIDER)
    private readonly policyProvider: SecurityPolicyProvider,
  ) {}

  async execute(intent: TransactionIntent): Promise<SecurityDecision> {
    const policy = await this.policyProvider.getPolicyForWallet(
      intent.walletId,
    );
    if (!policy) {
      return this.decision(
        intent.id,
        'rejected',
        'rejected: no security policy exists for this wallet; fail closed',
      );
    }

    if (policy.rejectEncodedPayloads) {
      const inspection = inspectIntentPayload(intent);
      if (inspection.suspicious) {
        return this.decision(
          intent.id,
          'rejected',
          `rejected: suspicious payload (${inspection.reason})`,
        );
      }
    }

    if (!policy.allowedOrigins.includes(intent.origin)) {
      return this.decision(
        intent.id,
        'rejected',
        `rejected: origin "${intent.origin}" is not in the wallet origin allowlist`,
      );
    }

    if (!policy.allowedChains.includes(intent.chain)) {
      return this.decision(
        intent.id,
        'rejected',
        `rejected: chain "${intent.chain}" is not in the wallet chain allowlist`,
      );
    }

    const valueUsd = await this.priceLookup.getUsdValue(intent);
    if (valueUsd === null) {
      return this.decision(
        intent.id,
        'needs_human_approval',
        'needs_human_approval: USD price unavailable, value cannot be verified',
      );
    }

    if (valueUsd > policy.approvalThresholdUsd) {
      return this.decision(
        intent.id,
        'needs_human_approval',
        `needs_human_approval: value $${valueUsd.toFixed(
          2,
        )} exceeds approval threshold $${policy.approvalThresholdUsd.toFixed(2)}`,
      );
    }

    const spentUsdToday = await this.dailySpend.getSpentUsdToday(
      intent.walletId,
    );
    if (policy.dailyCapUsd <= 0 && valueUsd > 0) {
      return this.decision(
        intent.id,
        'rejected',
        'rejected: daily cap is zero; no outbound value allowed',
      );
    }
    if (spentUsdToday + valueUsd > policy.dailyCapUsd) {
      return this.decision(
        intent.id,
        'rejected',
        `rejected: daily cap exceeded (spent $${spentUsdToday.toFixed(
          2,
        )} + $${valueUsd.toFixed(2)} > cap $${policy.dailyCapUsd.toFixed(2)})`,
      );
    }

    return this.decision(intent.id, 'approved', 'approved: within policy');
  }

  private decision(
    intentId: string,
    result: SecurityDecision['result'],
    reason: string,
  ): SecurityDecision {
    return { intentId, result, reason, decidedAt: new Date().toISOString() };
  }
}
