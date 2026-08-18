import { Inject, Injectable } from '@nestjs/common';
import type { TransactionIntent } from '@kryptr/shared-types';
import type { IntentStore, SecurityPolicyProvider } from './ports';
import crypto from 'crypto';
import { DomainError } from '../../common/domain-error';

/**
 * Creates a transfer transaction intent and saves it to the intent store.
 * Full security policy evaluation happens via EvaluateIntentUseCase separately.
 */
@Injectable()
export class CreateTransferUseCase {
  constructor(
    @Inject('security.intent-store') private readonly intentStore: IntentStore,
    @Inject('security.policy-provider') private readonly policyProvider: SecurityPolicyProvider,
  ) {}

  async execute(
    walletId: string,
    chain: string,
    to: `0x${string}`,
    asset: `0x${string}` | null,
    amount: string,
    origin: string,
  ): Promise<TransactionIntent> {
    // Validate wallet exists by checking if policy can be retrieved
    const policy = await this.policyProvider.getPolicyForWallet(walletId);
    if (!policy) {
      throw new DomainError(
        'wallet_not_found',
        `wallet "${walletId}" does not exist or has no policy`,
        404,
      );
    }

    // Generate deterministic intent ID
    const intentId = this.generateIntentId(walletId, chain, to, asset, amount, origin);

    // Build the intent
    const intent: TransactionIntent = {
      id: intentId,
      walletId,
      chain: chain as any,
      kind: asset ? 'approve' : 'transfer',
      to,
      asset,
      amount,
      origin,
      createdAt: new Date().toISOString(),
    };

    // Save the intent
    await this.intentStore.save(intent);

    return intent;
  }

  private generateIntentId(
    walletId: string,
    chain: string,
    to: string,
    asset: string | null,
    amount: string,
    origin: string,
  ): string {
    const data = JSON.stringify({ walletId, chain, to, asset, amount, origin });
    return `intent-${crypto.createHash('sha256').update(data).digest('hex').slice(0, 16)}`;
  }
}
