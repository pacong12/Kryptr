import { computed, onScopeDispose, ref, toValue } from 'vue';
import type { MaybeRefOrGetter } from 'vue';
import type {
  ApiError,
  DeployContext,
  TransactionIntent,
  VerificationArtifactRef,
  VerificationClaim,
  VerificationClaimKind,
} from '@kryptr/shared-types';
import { VERIFICATION_CLAIMS, ok } from '@kryptr/shared-types';
import {
  DEFAULT_LAUNCHPAD_SOURCE,
  createStubConsentSource,
  type LaunchpadSource,
} from '@/lib/launchpad';
import { MOCK_LAUNCH_DRAFT, MOCK_VERIFICATION_ARTIFACT } from '@/lib/fixtures';
import { isNetworkError } from '@/lib/api';

/** Draft lifecycle; the composable owns the machine. */
export type ConsentDraftState = 'loading' | 'ready' | 'error';

/** T21 chip lifecycle: verified is earned, everything else fails closed. */
export type VerificationState = 'idle' | 'loading' | 'verified' | 'unverified';

/** Why a chip is unverified — honest reasons, never guessed claims. */
export type VerificationFailReason =
  | 'missing'
  | 'fetch_failed'
  | 'id_mismatch'
  | 'hash_mismatch'
  | 'claims_missing';

/** Runtime guard: the wire may carry strings outside the frozen union. */
function isKnownClaim(value: string): value is VerificationClaimKind {
  return (VERIFICATION_CLAIMS as readonly string[]).includes(value);
}

/**
 * Owns the wave-5 launch consent screen data flow:
 *
 * - Draft: fetch the frozen `DeployContext`; only an UNREACHABLE API falls
 *   back to badged mock fixtures (wave-1 pattern). Any live error envelope
 *   surfaces as-is — fixtures never mask live errors.
 * - T21 chip: fetch the artifact by the draft's embedded ref, compare id +
 *   hash, require artifact claims ⊇ ref claims (frozen vocabulary only),
 *   render claims only on full match; otherwise unverified + reason.
 * - Consent submission: fail-closed stub while the launchpad API is absent.
 */
export function useLaunchConsent(
  walletId: MaybeRefOrGetter<string>,
  source: LaunchpadSource = DEFAULT_LAUNCHPAD_SOURCE,
) {
  const draftState = ref<ConsentDraftState>('loading');
  const context = ref<DeployContext | null>(null);
  const draftError = ref<ApiError | null>(null);
  /** True when draft + artifact come from badged fixtures (API unreachable). */
  const mockMode = ref(false);

  const verificationState = ref<VerificationState>('idle');
  const verificationReason = ref<VerificationFailReason | null>(null);
  const verifiedClaims = ref<VerificationClaim[]>([]);

  const submitting = ref(false);
  const consentError = ref<ApiError | null>(null);
  const consented = ref<TransactionIntent | null>(null);

  let requestSeq = 0;
  const stubConsent = createStubConsentSource();

  /** Consent is earned: draft ready AND the chip is verified. */
  const consentReady = computed(
    () =>
      draftState.value === 'ready' && verificationState.value === 'verified',
  );

  /** Verify the draft's embedded ref against the fetched artifact. */
  function verifyAgainst(
    refClaim: VerificationArtifactRef,
    artifact: VerificationArtifactRef,
  ): VerificationFailReason | null {
    if (artifact.id !== refClaim.id) return 'id_mismatch';
    if (artifact.hash !== refClaim.hash) return 'hash_mismatch';
    const artifactKinds = artifact.claims
      .map((claim) => claim.claim as string)
      .filter(isKnownClaim);
    const covered = refClaim.claims
      .map((claim) => claim.claim as string)
      .filter(isKnownClaim)
      .every((kind) => artifactKinds.includes(kind));
    if (!covered) return 'claims_missing';
    return null;
  }

  async function refresh(): Promise<void> {
    const seq = ++requestSeq;
    draftState.value = 'loading';
    context.value = null;
    draftError.value = null;
    consentError.value = null;
    consented.value = null;
    verificationState.value = 'idle';
    verificationReason.value = null;
    verifiedClaims.value = [];

    const draftResult = await source.draft(toValue(walletId));
    if (seq !== requestSeq) return;

    let draft: DeployContext;
    if (draftResult.ok && draftResult.data) {
      draft = draftResult.data;
      mockMode.value = false;
    } else if (isNetworkError(draftResult.error)) {
      // API unreachable → badged fixtures (wave-1 pattern). Live error
      // envelopes NEVER fall back.
      draft = MOCK_LAUNCH_DRAFT;
      mockMode.value = true;
    } else {
      draftState.value = 'error';
      draftError.value = draftResult.error ?? {
        code: 'unknown',
        message: 'Unable to load the launch draft.',
      };
      return;
    }

    context.value = draft;
    draftState.value = 'ready';

    // T21 chip: fetch by id → compare hash → claims ⊇ ref → render.
    const refClaim = draft.verification;
    if (refClaim === undefined) {
      verificationState.value = 'unverified';
      verificationReason.value = 'missing';
      return;
    }
    verificationState.value = 'loading';
    const artifactResult = mockMode.value
      ? ok<VerificationArtifactRef>(MOCK_VERIFICATION_ARTIFACT)
      : await source.verification(refClaim.id);
    if (seq !== requestSeq) return;

    if (!artifactResult.ok || artifactResult.data === null) {
      // No fixture fallback on the live path: a consent under a reachable
      // API must verify against the real artifact or stay unverified.
      verificationState.value = 'unverified';
      verificationReason.value = 'fetch_failed';
      return;
    }
    const reason = verifyAgainst(refClaim, artifactResult.data);
    if (reason !== null) {
      verificationState.value = 'unverified';
      verificationReason.value = reason;
      return;
    }
    verifiedClaims.value = artifactResult.data.claims.filter((claim) =>
      isKnownClaim(claim.claim as string),
    );
    verificationState.value = 'verified';
  }

  /** Submit the consent; fails closed while the launchpad API is absent. */
  async function submitConsent(): Promise<boolean> {
    if (context.value === null || !consentReady.value) return false;
    submitting.value = true;
    consentError.value = null;
    const result = mockMode.value
      ? await stubConsent.consent(context.value)
      : await source.consent(context.value);
    submitting.value = false;
    if (result.ok && result.data) {
      consented.value = result.data;
      return true;
    }
    consentError.value = result.error ?? {
      code: 'unknown',
      message: 'Unable to submit the launch consent.',
    };
    return false;
  }

  onScopeDispose(() => {
    requestSeq += 1;
  });

  return {
    draftState,
    context,
    draftError,
    mockMode,
    verificationState,
    verificationReason,
    verifiedClaims,
    consentReady,
    submitting,
    consentError,
    consented,
    refresh,
    submitConsent,
  };
}
