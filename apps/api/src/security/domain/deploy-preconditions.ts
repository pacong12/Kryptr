import type {
  ChainId,
  TransactionIntent,
  VerificationArtifactRef,
} from '@kryptr/shared-types';
import { VERIFICATION_CLAIMS } from '@kryptr/shared-types';
import { ADDRESS_PATTERN } from '../../common/address';
import { isRecord } from '../../common/type-guards';

/**
 * Wave-5 deploy preconditions (vault design doc §2 item 3, gate table
 * §3). Pure gate logic over the consent-frozen DeployContext: every
 * failure maps to ONE stable reject code consumed verbatim by DeckUI
 * timelines and FaceUI error maps. All checks run PRE-SIGN and
 * fail-closed.
 *
 * Fee arithmetic follows the Q1 ruling as refined by Review54 F1:
 * `feeBps` integers are the SOURCE OF TRUTH; sum/non-negative checks
 * are pure integer arithmetic; share↔bps consistency is
 * `Math.round(share * 10_000) === bps` — NEVER literal float equality
 * (IEEE754: 1149 of 9999 bps-derived shares break literal equality).
 */

/** Stable, UI-mappable reject codes for deploy decisions (doc §2 item 5). */
export const DEPLOY_REJECT_CODES = [
  'factory_mismatch',
  'factory_not_allowlisted',
  'deploy_bond_unpaid',
  'deploy_context_invalid',
  'fee_schedule_invalid',
  'fee_recipients_invalid',
  'verification_missing',
] as const;
export type DeployRejectCode = (typeof DEPLOY_REJECT_CODES)[number];

/**
 * Per-launch total fee in bps (doc §2: parameterized, 175 reference).
 * Wiring-time constant today; moves to config in the factory era.
 */
export const LAUNCH_TOTAL_FEE_BPS = 175;

/** Frozen claim vocabulary (T21 union); membership check at the gate. */
const CLAIM_VOCABULARY: ReadonlySet<string> = new Set(VERIFICATION_CLAIMS);

/** Token name: 1–64 printable-ASCII chars after trim (FaceUI parity). */
const NAME_MAX = 64;
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;
/** Token symbol: 1–12 uppercase alphanumerics, no space/underscore. */
const SYMBOL_PATTERN = /^[A-Z0-9]{1,12}$/;
/** Raw supply: positive integer string, bounded to uint256 width (C6). */
const SUPPLY_MAX_DIGITS = 78; // uint256 max is 78 digits
const POSITIVE_INT_PATTERN = /^[1-9][0-9]*$/;

export interface DeployPreconditionsDeps {
  /** Layer-2 allowlist (fail-closed; empty manifest ⇒ always false). */
  isFactoryAllowed(chain: ChainId, factory: `0x${string}`): boolean;
  /** Canonical T21 artifact lookup for the consent-chip parity check. */
  resolveVerification(id: string): Promise<VerificationArtifactRef | null>;
  /** Launch total fee in bps; defaults to LAUNCH_TOTAL_FEE_BPS. */
  totalFeeBps?: number;
}

/**
 * Validate a deploy intent's frozen context. Returns the reject code,
 * or null when every precondition holds (the gate then escalates to
 * unconditional HITL — deploys never auto-approve).
 */
export async function validateDeployPreconditions(
  intent: TransactionIntent,
  deps: DeployPreconditionsDeps,
): Promise<DeployRejectCode | null> {
  const deploy = intent.deploy;
  if (!deploy) {
    // Contract: deploy context present iff kind === 'deploy'. A missing
    // context can never be consented — fail closed.
    return 'deploy_context_invalid';
  }

  // 1. Structural: what was consented is what gets executed (T17).
  // Shape guard first (C3): a malformed factory can never match intent.to.
  if (
    intent.to === null ||
    typeof deploy.factory !== 'string' ||
    deploy.factory.toLowerCase() !== intent.to.toLowerCase()
  ) {
    return 'factory_mismatch';
  }

  // 2. Layer-2 allowlist: pinned from the ops manifest, fail-closed.
  if (!deps.isFactoryAllowed(intent.chain, deploy.factory)) {
    return 'factory_not_allowlisted';
  }

  // 3. Bond: the gate validates the paid flag; the bond itself is
  // on-chain (memo ruling 2 split; factory era wires the real check).
  if (deploy.bondPaid !== true) {
    return 'deploy_bond_unpaid';
  }

  // 4. Token fields (FaceUI-agreed constraints; both sides map to the
  // same deploy_context_invalid code). Shape guards first (C3).
  if (typeof deploy.tokenName !== 'string') {
    return 'deploy_context_invalid';
  }
  const name = deploy.tokenName.trim();
  if (
    name.length === 0 ||
    name.length > NAME_MAX ||
    !PRINTABLE_ASCII.test(name)
  ) {
    return 'deploy_context_invalid';
  }
  if (
    typeof deploy.tokenSymbol !== 'string' ||
    !SYMBOL_PATTERN.test(deploy.tokenSymbol)
  ) {
    return 'deploy_context_invalid';
  }
  if (
    typeof deploy.totalSupply !== 'string' ||
    deploy.totalSupply.length > SUPPLY_MAX_DIGITS ||
    !POSITIVE_INT_PATTERN.test(deploy.totalSupply)
  ) {
    return 'deploy_context_invalid';
  }

  // 5. Fee mirrors — integer arithmetic only (Q1 + F1). Shape guards
  // first (C3): a missing mirror object is a schedule violation, not a 500.
  if (!isRecord(deploy.feeSchedule) || !isRecord(deploy.feeBps)) {
    return 'fee_schedule_invalid';
  }
  const totalFeeBps = deps.totalFeeBps ?? LAUNCH_TOTAL_FEE_BPS;
  const shares = [
    deploy.feeSchedule.creatorShare,
    deploy.feeSchedule.lpShare,
    deploy.feeSchedule.protocolShare,
    deploy.feeSchedule.buybackShare,
  ] as unknown[];
  const mirrors = [
    deploy.feeBps.creator,
    deploy.feeBps.lp,
    deploy.feeBps.protocol,
    deploy.feeBps.buyback,
  ] as unknown[];
  if (
    shares.some(
      (share) =>
        typeof share !== 'number' ||
        !Number.isFinite(share) ||
        share < 0 ||
        share > 1,
    )
  ) {
    return 'fee_schedule_invalid';
  }
  if (
    mirrors.some(
      (bps) =>
        typeof bps !== 'number' ||
        !Number.isInteger(bps) ||
        bps < 0 ||
        bps > 10_000,
    )
  ) {
    return 'fee_schedule_invalid';
  }
  const mirrorInts = mirrors as number[];
  if (mirrorInts.reduce((sum, bps) => sum + bps, 0) !== totalFeeBps) {
    return 'fee_schedule_invalid';
  }
  for (let i = 0; i < mirrorInts.length; i += 1) {
    // Math.round, never literal equality (Review54 F1; see module doc).
    if (Math.round((shares[i] as number) * 10_000) !== mirrorInts[i]) {
      return 'fee_schedule_invalid';
    }
  }

  // 6. Recipients: four well-formed EVM addresses (T17 surface).
  // Shape guard first (C3).
  if (!isRecord(deploy.feeRecipients)) {
    return 'fee_recipients_invalid';
  }
  const recipients = [
    deploy.feeRecipients.creator,
    deploy.feeRecipients.lp,
    deploy.feeRecipients.protocol,
    deploy.feeRecipients.buyback,
  ] as unknown[];
  if (
    !recipients.every(
      (address) => typeof address === 'string' && ADDRESS_PATTERN.test(address),
    )
  ) {
    return 'fee_recipients_invalid';
  }

  // 7. T21 verification artifact (decision condition 1 + FaceUI flag):
  // required for allowlisted factories, and the embedded ref must match
  // the canonical artifact — server-side parity of the consent chip's
  // fetch-and-compare flow. Nothing opaque, nothing trust-me.
  // Shape guards first (C3): a malformed ref is a missing artifact.
  const verification = deploy.verification;
  if (!isRecord(verification) || !Array.isArray(verification.claims)) {
    return 'verification_missing';
  }
  const claims = verification.claims as unknown[];
  if (
    claims.length === 0 ||
    claims.some(
      (claim) =>
        !isRecord(claim) ||
        typeof claim.claim !== 'string' ||
        typeof claim.verifiedAt !== 'string',
    )
  ) {
    return 'verification_missing';
  }
  const claimKinds = claims.map((claim) => (claim as { claim: string }).claim);
  // Review54 N2: the claim vocabulary is frozen (VERIFICATION_CLAIMS).
  // A ref carrying an unknown claim is rejected at the source — the
  // client-side filter is UX, not the security boundary.
  if (claimKinds.some((kind) => !CLAIM_VOCABULARY.has(kind))) {
    return 'verification_missing';
  }
  if (
    typeof verification.id !== 'string' ||
    typeof verification.hash !== 'string'
  ) {
    return 'verification_missing';
  }
  const canonical = await deps.resolveVerification(verification.id);
  if (canonical === null || canonical.hash !== verification.hash) {
    return 'verification_missing';
  }
  // SecReview68 C1: the canonical artifact's claims must cover every
  // embedded claim — hash parity alone never blesses extra claims.
  const canonicalKinds: ReadonlySet<string> = new Set(
    canonical.claims.map((claim) => claim.claim),
  );
  if (claimKinds.some((kind) => !canonicalKinds.has(kind))) {
    return 'verification_missing';
  }

  return null;
}
