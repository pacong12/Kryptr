import type { TransactionIntent } from '@kryptr/shared-types';
import type { IntentStore } from '../application/ports';

/**
 * In-memory intent store. Evaluated intents are kept so the timeline
 * endpoint and execution preview can reference them by id. Replaced by
 * Postgres in the persistence task.
 */
export class InMemoryIntentStore implements IntentStore {
  private readonly intents = new Map<string, TransactionIntent>();

  async save(intent: TransactionIntent): Promise<void> {
    this.intents.set(intent.id, intent);
  }

  async findById(id: string): Promise<TransactionIntent | null> {
    return this.intents.get(id) ?? null;
  }
}
