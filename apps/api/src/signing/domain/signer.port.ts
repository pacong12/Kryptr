import type {
  ChainId,
  SignRequest,
  UnsignedTxPreview,
} from '@kryptr/shared-types';

/**
 * SignerPort — the ONLY seam through which a gate-approved intent moves
 * toward a signature (wave 3: DryRunSigner; later an external
 * Privy-style signer). This port can REQUEST signatures; it can never
 * produce one on its own. No keys live anywhere behind it: wave 3's
 * DryRunSigner merely hashes the unsigned calldata (needs no key) and
 * reports what WOULD be signed.
 */

export const SIGNER = 'signing.signer';

export interface SignerPort {
  /**
   * Prepare a sign request for an approved intent. Implementations MUST
   * refuse anything not gate-approved upstream (the use case enforces
   * the approved-only guard before calling this).
   */
  requestSignature(input: {
    intentId: string;
    chain: ChainId;
    preview: UnsignedTxPreview;
  }): Promise<SignRequest>;
  /** Lookup by request id; null when unknown. */
  getStatus(id: string): Promise<SignRequest | null>;
}
