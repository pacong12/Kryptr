import type { InjectionKey } from 'vue';
import type {
  ApiEnvelope,
  DeployContext,
  TransactionIntent,
  VerificationArtifactRef,
} from '@kryptr/shared-types';
import { err } from '@kryptr/shared-types';
import { apiGet, apiPost } from '@/lib/api';

/**
 * Wave-5 launchpad data port (FaceUI). The launchpad API endpoints have not
 * landed yet (deploy-gate branch precedes the factory), so the default
 * source answers fail-closed envelopes and the consent screen degrades
 * honestly with the fixture/mock-badge pattern. When the endpoints land,
 * `createApiLaunchpadSource` slots in without touching composables.
 */
export interface LaunchpadSource {
  /**
   * The launch draft under consent — the frozen `DeployContext` exactly as
   * the user will consent to it (what was consented is what gets validated).
   */
  draft(walletId: string): Promise<ApiEnvelope<DeployContext>>;

  /**
   * Canonical T21 verification artifact by id (paired read endpoint of the
   * deploy-gate branch). The consent chip fetches it, compares `hash` and
   * `claims` against the draft's embedded ref and renders only on match.
   */
  verification(
    artifactId: string,
  ): Promise<ApiEnvelope<VerificationArtifactRef>>;

  /**
   * Submit the consent (creates the `kind='deploy'` intent for HITL).
   * Fail-closed until the deploy-gate branch lands.
   */
  consent(context: DeployContext): Promise<ApiEnvelope<TransactionIntent>>;
}

/**
 * API-bound source for the launchpad endpoints (not live yet — calls answer
 * network-error envelopes until the deploy-gate branch ships them).
 */
export function createApiLaunchpadSource(): LaunchpadSource {
  return {
    draft: async (walletId: string) =>
      apiGet<DeployContext>(`/launchpad/wallets/${walletId}/draft`),
    verification: async (artifactId: string) =>
      apiGet<VerificationArtifactRef>(
        `/launchpad/verification/${encodeURIComponent(artifactId)}`,
      ),
    consent: async (context: DeployContext) =>
      apiPost<TransactionIntent>('/launchpad/consent', context),
  };
}

/** App-wide default source: the API-bound one (fail-closed until it lands). */
export const DEFAULT_LAUNCHPAD_SOURCE: LaunchpadSource =
  createApiLaunchpadSource();

/**
 * Error code used while the launchpad API has not landed. NOT a frozen
 * shared-types code yet — the deploy-gate branch freezes the launchpad
 * error vocabulary; this local constant is replaced then.
 */
export const LAUNCH_UNAVAILABLE_CODE = 'launch_unavailable';

const STUB_MESSAGE =
  'Launch submission is not wired in this deployment — the deploy gate lands before the factory. Nothing here is simulated.';

/**
 * Fail-closed stub for the consent submission: honest envelope error, never
 * a fabricated intent. Draft/verification stay API-bound (the composable
 * falls back to badged fixtures only when the API is unreachable).
 */
export function createStubConsentSource(): Pick<LaunchpadSource, 'consent'> {
  return {
    consent: async (_context: DeployContext) =>
      err<TransactionIntent>({
        code: LAUNCH_UNAVAILABLE_CODE,
        message: STUB_MESSAGE,
      }),
  };
}

/**
 * Optional page-level override seam (tests provide controlled sources).
 * Production uses the API-bound default above.
 */
export const LAUNCHPAD_SOURCE_KEY: InjectionKey<LaunchpadSource> =
  Symbol('launchpadSource');
