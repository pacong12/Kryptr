import { describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import type {
  DeployContext,
  TransactionIntent,
  VerificationArtifactRef,
  VerificationClaimKind,
} from '@kryptr/shared-types';
import { err, ok } from '@kryptr/shared-types';
import { useLaunchConsent } from './useLaunchConsent';
import type { LaunchpadSource } from '@/lib/launchpad';
import { MOCK_LAUNCH_DRAFT, MOCK_VERIFICATION_ARTIFACT } from '@/lib/fixtures';

const NETWORK_ERROR = {
  code: 'network_error',
  message: 'unreachable',
} as const;

/** Default: everything unreachable (fixture-fallback scenario). */
function launchSource(
  overrides: Partial<LaunchpadSource> = {},
): LaunchpadSource {
  return {
    draft: async () => err<DeployContext>(NETWORK_ERROR),
    verification: async () => err<VerificationArtifactRef>(NETWORK_ERROR),
    consent: async () => err<TransactionIntent>(NETWORK_ERROR),
    ...overrides,
  };
}

function liveContext(verification?: VerificationArtifactRef): DeployContext {
  return { ...MOCK_LAUNCH_DRAFT, verification };
}

function artifact(
  overrides: Partial<VerificationArtifactRef> = {},
): VerificationArtifactRef {
  return { ...MOCK_VERIFICATION_ARTIFACT, ...overrides };
}

function mountComposable(source: LaunchpadSource) {
  const scope = effectScope();
  const api = scope.run(() => useLaunchConsent('wallet-base-demo', source));
  if (!api) throw new Error('composable failed to mount');
  return { api, stop: () => scope.stop() };
}

describe('useLaunchConsent (launch consent data flow, fail-closed)', () => {
  it('falls back to badged fixtures when the API is unreachable', async () => {
    const { api, stop } = mountComposable(launchSource());

    await api.refresh();

    expect(api.draftState.value).toBe('ready');
    expect(api.mockMode.value).toBe(true);
    expect(api.context.value).toEqual(MOCK_LAUNCH_DRAFT);
    // The fixture artifact matches the fixture ref → chip verified, badged.
    expect(api.verificationState.value).toBe('verified');
    expect(api.verifiedClaims.value).toHaveLength(4);
    expect(api.consentReady.value).toBe(true);
    stop();
  });

  it('never fixture-masks a live error envelope', async () => {
    const { api, stop } = mountComposable(
      launchSource({
        draft: async () =>
          err<DeployContext>({
            code: 'launch_not_allowed',
            message: 'This wallet may not launch.',
          }),
      }),
    );

    await api.refresh();

    expect(api.draftState.value).toBe('error');
    expect(api.draftError.value?.code).toBe('launch_not_allowed');
    expect(api.mockMode.value).toBe(false);
    expect(api.context.value).toBeNull();
    stop();
  });

  it('marks the chip unverified when the live draft has no verification ref', async () => {
    const { api, stop } = mountComposable(
      launchSource({ draft: async () => ok(liveContext(undefined)) }),
    );

    await api.refresh();

    expect(api.mockMode.value).toBe(false);
    expect(api.verificationState.value).toBe('unverified');
    expect(api.verificationReason.value).toBe('missing');
    expect(api.consentReady.value).toBe(false);
    stop();
  });

  it('verifies a live artifact that matches id, hash and claims', async () => {
    const ref = MOCK_VERIFICATION_ARTIFACT;
    const { api, stop } = mountComposable(
      launchSource({
        draft: async () => ok(liveContext(ref)),
        verification: async () => ok(artifact()),
      }),
    );

    await api.refresh();

    expect(api.verificationState.value).toBe('verified');
    expect(api.verifiedClaims.value.map((claim) => claim.claim)).toEqual(
      ref.claims.map((claim) => claim.claim),
    );
    expect(api.consentReady.value).toBe(true);
    stop();
  });

  it('fails closed on a hash mismatch and renders no claims', async () => {
    const ref = MOCK_VERIFICATION_ARTIFACT;
    const { api, stop } = mountComposable(
      launchSource({
        draft: async () => ok(liveContext(ref)),
        verification: async () => ok(artifact({ hash: '0xdeadbeef' })),
      }),
    );

    await api.refresh();

    expect(api.verificationState.value).toBe('unverified');
    expect(api.verificationReason.value).toBe('hash_mismatch');
    expect(api.verifiedClaims.value).toHaveLength(0);
    expect(api.consentReady.value).toBe(false);
    stop();
  });

  it('fails closed when the artifact covers fewer claims than consented', async () => {
    const ref = MOCK_VERIFICATION_ARTIFACT;
    const { api, stop } = mountComposable(
      launchSource({
        draft: async () => ok(liveContext(ref)),
        verification: async () =>
          ok(artifact({ claims: artifact().claims.slice(0, 3) })),
      }),
    );

    await api.refresh();

    expect(api.verificationState.value).toBe('unverified');
    expect(api.verificationReason.value).toBe('claims_missing');
    stop();
  });

  it('fails closed on an id mismatch', async () => {
    const ref = MOCK_VERIFICATION_ARTIFACT;
    const { api, stop } = mountComposable(
      launchSource({
        draft: async () => ok(liveContext(ref)),
        verification: async () => ok(artifact({ id: 't21:base:other' })),
      }),
    );

    await api.refresh();

    expect(api.verificationReason.value).toBe('id_mismatch');
    stop();
  });

  it('stays unverified when the artifact fetch fails on the live path', async () => {
    const ref = MOCK_VERIFICATION_ARTIFACT;
    const { api, stop } = mountComposable(
      launchSource({
        draft: async () => ok(liveContext(ref)),
        // verification stays network_error → fetch_failed, NO fixture.
      }),
    );

    await api.refresh();

    expect(api.mockMode.value).toBe(false);
    expect(api.verificationState.value).toBe('unverified');
    expect(api.verificationReason.value).toBe('fetch_failed');
    stop();
  });

  it('ignores unrecognized artifact claims but keeps the match', async () => {
    const ref = MOCK_VERIFICATION_ARTIFACT;
    const stranger = {
      claim: 'future_claim' as unknown as VerificationClaimKind,
      evidence: 'not in the frozen vocabulary',
      verifiedAt: '2026-08-16T12:00:00.000Z',
    };
    const { api, stop } = mountComposable(
      launchSource({
        draft: async () => ok(liveContext(ref)),
        verification: async () =>
          ok(artifact({ claims: [...artifact().claims, stranger] })),
      }),
    );

    await api.refresh();

    expect(api.verificationState.value).toBe('verified');
    expect(api.verifiedClaims.value).toHaveLength(4);
    expect(api.verifiedClaims.value.map((claim) => claim.claim)).not.toContain(
      'future_claim',
    );
    stop();
  });

  it('answers the honest launch_unavailable stub in mock mode', async () => {
    const { api, stop } = mountComposable(launchSource());
    await api.refresh();
    expect(api.consentReady.value).toBe(true);

    const success = await api.submitConsent();

    expect(success).toBe(false);
    expect(api.consentError.value?.code).toBe('launch_unavailable');
    expect(api.consented.value).toBeNull();
    stop();
  });

  it('never calls the consent endpoint unless verified', async () => {
    const consent = vi.fn();
    const { api, stop } = mountComposable(
      launchSource({
        draft: async () => ok(liveContext(undefined)),
        consent: async (...args) => consent(...args),
      }),
    );
    await api.refresh();
    expect(api.consentReady.value).toBe(false);

    const success = await api.submitConsent();

    expect(success).toBe(false);
    expect(consent).not.toHaveBeenCalled();
    stop();
  });

  it('records a live consent intent when the endpoint lands', async () => {
    const ref = MOCK_VERIFICATION_ARTIFACT;
    const intent: TransactionIntent = {
      id: 'intent-deploy-1',
      walletId: 'wallet-base-demo',
      chain: 'base',
      kind: 'deploy',
      to: MOCK_LAUNCH_DRAFT.factory,
      asset: null,
      amount: '0',
      origin: 'user',
      deploy: MOCK_LAUNCH_DRAFT,
      createdAt: '2026-08-17T00:00:00.000Z',
    };
    const { api, stop } = mountComposable(
      launchSource({
        draft: async () => ok(liveContext(ref)),
        verification: async () => ok(artifact()),
        consent: async () => ok(intent),
      }),
    );
    await api.refresh();

    const success = await api.submitConsent();

    expect(success).toBe(true);
    expect(api.consented.value?.id).toBe('intent-deploy-1');
    expect(api.consentError.value).toBeNull();
    stop();
  });

  it('resets prior consent state on refresh', async () => {
    const { api, stop } = mountComposable(launchSource());
    await api.refresh();
    await api.submitConsent();
    expect(api.consentError.value).not.toBeNull();

    await api.refresh();

    expect(api.consentError.value).toBeNull();
    expect(api.consented.value).toBeNull();
    stop();
  });
});
