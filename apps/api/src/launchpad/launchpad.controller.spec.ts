import type { VerificationArtifactRef } from '@kryptr/shared-types';
import { LaunchpadController } from './launchpad.controller';
import { InMemoryVerificationStore } from './infrastructure/in-memory-verification-store';

/**
 * GET /launchpad/verification/:id — the consent chip's canonical
 * artifact source (FaceUI flag). Boots empty; unknown ids fail closed.
 */

const ARTIFACT: VerificationArtifactRef = {
  id: 't21:factory-base:v1',
  hash: '0xdeadbeef',
  claims: [
    { claim: 'admin_key_free', verifiedAt: '2026-08-01T00:00:00.000Z' },
    { claim: 'non_upgradeable', verifiedAt: '2026-08-01T00:00:00.000Z' },
  ],
};

describe('LaunchpadController verification read endpoint', () => {
  let store: InMemoryVerificationStore;
  let controller: LaunchpadController;

  beforeEach(() => {
    store = new InMemoryVerificationStore();
    controller = new LaunchpadController(store);
  });

  it('boots empty: unknown id ⇒ envelope error (chip renders nothing)', async () => {
    const envelope = await controller.verificationArtifact('t21:unknown');
    expect(envelope.ok).toBe(false);
    expect(envelope.data).toBeNull();
    expect(envelope.error?.code).toBe('verification_artifact_not_found');
  });

  it('serves a seeded artifact verbatim (id, hash, claims)', async () => {
    await store.put(ARTIFACT);
    const envelope = await controller.verificationArtifact(ARTIFACT.id);
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toEqual(ARTIFACT);
    expect(envelope.error).toBeNull();
  });

  it('in-memory store: put/get round-trip, missing id ⇒ null', async () => {
    expect(await store.get('nope')).toBeNull();
    await store.put(ARTIFACT);
    expect(await store.get(ARTIFACT.id)).toEqual(ARTIFACT);
  });

  it('last put wins per id (re-seed replaces the canonical artifact)', async () => {
    await store.put(ARTIFACT);
    const revised: VerificationArtifactRef = {
      ...ARTIFACT,
      hash: '0xrevised',
    };
    await store.put(revised);
    expect(await store.get(ARTIFACT.id)).toEqual(revised);
  });
});
