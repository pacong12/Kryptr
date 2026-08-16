import { Inject, Injectable } from '@nestjs/common';
import type {
  SignRequest,
  TransactionIntent,
  UnsignedTxPreview,
} from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import { SIGNER, type SignerPort } from '../../signing/domain/signer.port';
import {
  DEX_AGGREGATOR,
  type DexAggregatorPort,
} from '../../trading/domain/dex-aggregator.port';
import {
  QUOTE_STORE,
  type QuoteStore,
} from '../../trading/domain/quote-store.port';
import {
  DECISION_AUDIT,
  INTENT_STORE,
  type DecisionAudit,
  type IntentStore,
} from './ports';

/**
 * Wave-3 signing scaffolding: prepares a SignRequest for an intent whose
 * LATEST gate decision is 'approved' (same guard as the execution
 * preview). Produces UnsignedTxPreview-shaped calldata — decimal wei from
 * the dex becomes hex wei here — and records sign_requested /
 * dry_run_signed steps in the append-only audit. Nothing here signs.
 */
@Injectable()
export class RequestSignatureUseCase {
  constructor(
    @Inject(INTENT_STORE) private readonly intentStore: IntentStore,
    @Inject(DECISION_AUDIT) private readonly decisionAudit: DecisionAudit,
    @Inject(QUOTE_STORE) private readonly quoteStore: QuoteStore,
    @Inject(DEX_AGGREGATOR) private readonly dex: DexAggregatorPort,
    @Inject(SIGNER) private readonly signer: SignerPort,
  ) {}

  async execute(intentId: string): Promise<SignRequest> {
    const intent = await this.intentStore.findById(intentId);
    if (!intent) {
      throw new DomainError(
        'intent_not_found',
        `intent "${intentId}" does not exist`,
        404,
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
        `latest decision for intent "${intentId}" is "${latest.result}"; only approved intents can request signatures`,
        403,
      );
    }

    const preview = await this.buildPreview(intent);
    await this.decisionAudit.appendSignEvent({
      intentId,
      step: 'sign_requested',
      detail: `sign request prepared for approved ${intent.kind} intent`,
      at: new Date().toISOString(),
    });
    const request = await this.signer.requestSignature({
      intentId,
      chain: intent.chain,
      preview,
    });
    await this.decisionAudit.appendSignEvent({
      intentId,
      step: 'dry_run_signed',
      detail: request.note,
      at: new Date().toISOString(),
    });
    return request;
  }

  /**
   * Unsigned tx per supported kind. Swaps reuse the approved quote's
   * executable calldata; native transfers are {to, empty data, value}.
   * Everything else fails closed — deploy/approve and ERC-20 transfers
   * are out of scope for wave-3 signing scaffolding.
   */
  private async buildPreview(
    intent: TransactionIntent,
  ): Promise<UnsignedTxPreview> {
    if (intent.kind === 'swap' && intent.swap) {
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
      return { to: tx.to, data: tx.data, value: toHexWei(tx.value) };
    }
    if (intent.kind === 'transfer' && intent.asset === null && intent.to) {
      return {
        to: intent.to,
        data: '0x',
        value: toHexWei(intent.amount ?? '0'),
      };
    }
    throw new DomainError(
      'sign_not_supported',
      `intent kind "${intent.kind}" cannot be prepared for signing in wave 3`,
      422,
    );
  }
}

/** Decimal wei (port convention) -> 0x-prefixed hex wei (SignRequest). */
function toHexWei(decimalWei: string): `0x${string}` {
  return `0x${BigInt(decimalWei).toString(16)}` as `0x${string}`;
}
