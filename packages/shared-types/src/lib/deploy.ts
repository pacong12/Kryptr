import type { TokenFeeSchedule } from './token.js';

/**
 * Wave-5 launchpad deploy contract (gate #4 prep — FROZEN).
 *
 * Contract-first freeze per launchpad-decision.md condition 4: this shape
 * is frozen BEFORE any launchpad UI build. Changes after freeze are
 * amendments only, recorded in the amendment log (PR #60 baseline:
 * initial freeze from docs/research/wave5-launchpad-vault-design.md §3,
 * incl. kickoff rulings Q1 (integer-bps mirrors) and the FaceUI flag
 * (T21 verification artifact must be client-addressable — never an
 * opaque id)).
 */

/**
 * T21 verification claim vocabulary — frozen baseline. Web3Intel owns
 * the list; the decision conditions require at least `admin_key_free`
 * and `non_upgradeable`. Additions are contract amendments.
 */
export const VERIFICATION_CLAIMS = [
  'admin_key_free',
  'non_upgradeable',
  'fee_split_invariant',
  'bond_accounting',
] as const;
export type VerificationClaimKind = (typeof VERIFICATION_CLAIMS)[number];

/** One verified claim from the T21 battery (decision condition 1). */
export interface VerificationClaim {
  claim: VerificationClaimKind;
  /** Evidence pointer inside the artifact (test id / file / section). */
  evidence?: string;
  /** ISO-8601 when the claim was verified. */
  verifiedAt: string;
}

/**
 * Client-addressable reference to a T21 verification artifact (FaceUI
 * flag): the consent chip may only render what it can fetch + verify.
 * Paired read endpoint (deploy-gate branch):
 * GET /launchpad/verification/:id → the canonical artifact; the chip
 * re-hashes and compares before rendering. Nothing opaque, nothing
 * trust-me.
 */
export interface VerificationArtifactRef {
  /** Stable artifact id, e.g. 't21:factory-base:v1'. */
  id: string;
  /** Content hash (sha256) of the canonical artifact, '0x'-prefixed hex. */
  hash: string;
  /** The verified claims the consent screen may render; never empty. */
  claims: VerificationClaim[];
}

/** Fee recipients frozen at deploy (memo deck §2.4: operators scrutinize). */
export interface FeeRecipients {
  creator: `0x${string}`;
  lp: `0x${string}`;
  protocol: `0x${string}`;
  buyback: `0x${string}`;
}

/** Integer-bps fee mirrors (Q1 ruling): the gate's validation basis. */
export interface FeeBps {
  creator: number;
  lp: number;
  protocol: number;
  buyback: number;
}

/**
 * Present iff TransactionIntent.kind === 'deploy'; frozen at consent,
 * validated pre-sign by the security gate (deploy-gate branch):
 * factory === intent.to + allowlist, bondPaid, fee mirrors consistent
 * with feeSchedule shares, recipients valid, verification present for
 * allowlisted factories. Mirrors SwapContext: bound context carrying
 * everything the consent screen displayed and the gate validated.
 */
export interface DeployContext {
  tokenName: string;
  tokenSymbol: string;
  /** Raw units, positive integer string (wave-4 amount convention). */
  totalSupply: string;
  /** Factory the deploy goes through; MUST equal intent.to + allowlist. */
  factory: `0x${string}`;
  /** Float shares stay the display/on-chain shape (constructor args). */
  feeSchedule: TokenFeeSchedule;
  /** Q1: integer-bps mirrors — the SOURCE OF TRUTH for gate arithmetic.
   *  Gate validates non-negative + sum equals the per-launch total fee bps
   *  (pure integer arithmetic); share↔bps consistency is
   *  Math.round(share * 10_000) === bps — never literal float equality
   *  (IEEE754: ~11.5% of derived shares break it; Review54 F1). */
  feeBps: FeeBps;
  feeRecipients: FeeRecipients;
  /** Memo ruling 2: gate validates bond-paid; the bond itself is on-chain. */
  bondPaid: boolean;
  /** T21 artifact (decision condition 1 + FaceUI flag): claims frozen at
   *  consent — what the user saw is what the decision audited. Required
   *  for allowlisted factories by the deploy-gate branch. */
  verification?: VerificationArtifactRef;
}
