import type { SignRequest, SignRequestStatus } from '@kryptr/shared-types';
import type { SignRequestStore } from '../domain/sign-request-store.port';

/**
 * In-memory sign-request store — the hermetic analogue of the Postgres
 * adapter's `ON CONFLICT (intent_id) DO NOTHING RETURNING` seam: the first
 * createIfAbsent for an intent wins, every later call for the same intent
 * returns null (the losing replica must stop).
 */
export class InMemorySignRequestStore implements SignRequestStore {
  private readonly byId = new Map<string, SignRequest>();
  private readonly byIntentId = new Map<string, string>();

  async createIfAbsent(request: SignRequest): Promise<SignRequest | null> {
    if (this.byIntentId.has(request.intentId)) {
      return null;
    }
    this.byId.set(request.id, { ...request });
    this.byIntentId.set(request.intentId, request.id);
    return { ...request };
  }

  async findById(id: string): Promise<SignRequest | null> {
    const found = this.byId.get(id);
    return found ? { ...found } : null;
  }

  async findByIntentId(intentId: string): Promise<SignRequest | null> {
    const id = this.byIntentId.get(intentId);
    return id ? this.findById(id) : null;
  }

  async markStatus(
    id: string,
    status: SignRequestStatus,
  ): Promise<SignRequest | null> {
    const found = this.byId.get(id);
    if (!found) {
      return null;
    }
    found.status = status;
    return { ...found };
  }
}
