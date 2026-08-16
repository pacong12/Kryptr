/**
 * Signing-boundary contracts (wave 3).
 *
 * Kryptr never stores keys and never signs autonomously. The API can only
 * PREPARE a signature request for an intent that already passed the
 * security gate; actual signing happens in an external signer (dry-run in
 * wave 3, Privy-style embedded wallet later — see
 * docs/research/wave2-trading-research.md §5).
 */

export const SIGN_REQUEST_STATUSES = [
  /** Prepared locally; nothing was signed, nothing will broadcast. */
  'dry_run',
  /** Forwarded to an external signer; awaiting its decision. */
  'pending',
  /** External signer produced a signature. */
  'signed',
  /** External signer (or policy) refused. */
  'rejected',
] as const;
export type SignRequestStatus = (typeof SIGN_REQUEST_STATUSES)[number];

/** Unsigned transaction echo, as produced by the execution preview. */
export interface UnsignedTxPreview {
  to: `0x${string}`;
  data: `0x${string}`;
  /** Raw wei; '0x0' when the swap sells an ERC-20. */
  value: `0x${string}`;
}

export interface SignRequest {
  id: string;
  /** The approved intent this request is bound to. */
  intentId: string;
  status: SignRequestStatus;
  /** Echo of the unsigned calldata the request was built from. */
  unsignedTx: UnsignedTxPreview;
  /**
   * Hash that WOULD be signed (digest of the unsigned tx). Present for
   * auditability; computing it needs no key. Null until computed.
   */
  digest: `0x${string}` | null;
  /** Human-readable signer note, e.g. 'dry-run only — nothing broadcast'. */
  note: string;
  createdAt: string;
}
