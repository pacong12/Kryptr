import { Injectable, Inject } from '@nestjs/common';
import type { TransactionIntent } from '@kryptr/shared-types';
import type { IntentStore } from './ports';

/**
 * Retrieves a transaction intent by ID and returns it.
 */
@Injectable()
export class GetIntentUseCase {
  constructor(@Inject('security.intent-store') private readonly intentStore: IntentStore) {}

  async execute(intentId: string): Promise<TransactionIntent> {
    const intent = await this.intentStore.findById(intentId);
    if (!intent) {
      throw new Error(`intent_not_found: intent "${intentId}" does not exist`);
    }
    return intent;
  }
}
