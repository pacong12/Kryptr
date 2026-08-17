import type { SignRequest, SignRequestStatus } from '@kryptr/shared-types';

/**
 * Persistent sign requests (wave-6 S1 §3.2/§5.3). The `UNIQUE(intent_id)`
 * constraint IS the cross-replica decision-binding guard: the second
 * replica's INSERT loses the conflict and receives nothing, so there is
 * exactly one sign request per approved intent and no intent can ever be
 * signed twice across replicas. Status transitions are append-audited via
 * the DecisionAudit sign-event seam (single-operator manual flow; a CAS
 * version column is an explicit follow-up if multi-operator signing lands).
 */

export const SIGN_REQUEST_STORE = 'signing.sign-request-store';

export interface SignRequestStore {
  /**
   * Insert-only seam (SQL: `ON CONFLICT (intent_id) DO NOTHING RETURNING`).
   * Returns the stored request when THIS call created it; null when the
   * intent already has a sign request (the losing replica must stop — it
   * never signs twice).
   */
  createIfAbsent(request: SignRequest): Promise<SignRequest | null>;
  findById(id: string): Promise<SignRequest | null>;
  findByIntentId(intentId: string): Promise<SignRequest | null>;
  /**
   * Status transition (`dry_run` → `pending` → `signed` | `rejected`).
   * Returns the updated request, or null when the id is unknown. Callers
   * append the matching sign event to DecisionAudit.
   */
  markStatus(
    id: string,
    status: SignRequestStatus,
  ): Promise<SignRequest | null>;
}
