import { Inject, Injectable } from '@nestjs/common';
import type { ChainId } from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import {
  DECISION_AUDIT,
  INTENT_STORE,
  type DecisionAudit,
  type IntentStore,
} from '../../security/application/ports';
import {
  DEX_AGGREGATOR,
  type DexAggregatorPort,
  type UnsignedSwapTx,
} from '../domain/dex-aggregator.port';
import { QUOTE_STORE, type QuoteStore } from '../domain/quote-store.port';

/**
 * The result of an execution preview. `signed: false` is a literal type
 * on purpose: this API can only ever produce UNSIGNED calldata.
 */
export interface SwapExecutionPreview extends UnsignedSwapTx {
  intentId: string;
  quoteId: string;
  chain: ChainId;
  signed: false;
  note: string;
}

/**
 * Quote-first swap flow, step 4: ONLY an intent whose latest audit
 * decision is 'approved' may obtain unsigned calldata. Anything else —
 * no decision, escalation, rejection, missing or expired quote — fails
 * closed with a domain error.
 */
@Injectable()
export class PreviewSwapExecutionUseCase {
  constructor(
    @Inject(INTENT_STORE) private readonly intentStore: IntentStore,
    @Inject(DECISION_AUDIT) private readonly decisionAudit: DecisionAudit,
    @Inject(QUOTE_STORE) private readonly quoteStore: QuoteStore,
    @Inject(DEX_AGGREGATOR) private readonly dex: DexAggregatorPort,
  ) {}

  async execute(intentId: string): Promise<SwapExecutionPreview> {
    const intent = await this.intentStore.findById(intentId);
    if (!intent) {
      throw new DomainError(
        'intent_not_found',
        `intent "${intentId}" does not exist`,
        404,
      );
    }
    if (intent.kind !== 'swap' || !intent.swap) {
      throw new DomainError(
        'not_a_swap_intent',
        `intent "${intentId}" is not a swap intent`,
        409,
      );
    }

    const entries = await this.decisionAudit.findByIntentId(intentId);
    const latest = entries[entries.length - 1];
    if (!latest) {
      throw new DomainError(
        'decision_not_found',
        `intent "${intentId}" has no gate decision yet`,
        409,
      );
    }
    if (latest.result !== 'approved') {
      throw new DomainError(
        'decision_not_approved',
        `latest decision for intent "${intentId}" is "${latest.result}"; only approved intents can preview execution`,
        403,
      );
    }

    const stored = await this.quoteStore.findById(intent.swap.quoteId);
    if (!stored) {
      throw new DomainError(
        'quote_not_found',
        `quote "${intent.swap.quoteId}" no longer exists`,
        410,
      );
    }
    if (Date.parse(stored.quote.expiresAt) <= Date.now()) {
      throw new DomainError(
        'quote_expired',
        `quote "${stored.quote.id}" expired; request a fresh quote and re-evaluate`,
        410,
      );
    }

    const tx = await this.dex.buildSwapTx(stored.quote);
    return {
      intentId: intent.id,
      quoteId: stored.quote.id,
      chain: intent.chain,
      ...tx,
      signed: false,
      note: 'Unsigned execution preview only. This API never signs transactions.',
    };
  }
}
