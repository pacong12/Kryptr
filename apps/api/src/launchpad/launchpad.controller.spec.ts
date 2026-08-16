import type { VerificationArtifactRef } from '@kryptr/shared-types';
import { DomainError } from '../common/domain-error';
import { LaunchpadController } from './launchpad.controller';
import { InMemoryVerificationStore } from './infrastructure/in-memory-verification-store';

/**
 * GET /launchpad/verification/:id — the consent chip's canonical
 * artifact source (FaceUI flag). Boots empty; unknown ids fail closed
 * with HTTP 404 via DomainError (SecReview68 C5); over-budget clients
 * get HTTP 429 rate_limited (SecReview68 C4).
 */

const ARTIFACT: VerificationArtifactRef = {
  id: 't21:factory-base:v1',
  hash: '0xdeadbeef',
  claims: [
    { claim: 'admin_key_free', verifiedAt: '2026-08-01T00:00:00.000Z' },
    { claim: 'non_upgradeable', verifiedAt: '2026-08-01T00:00:00.000Z' },
  ],
};

class RecordingLimiter {
  readonly keys: string[] = [];
  constructor(private readonly decision: boolean) {}
  tryConsume(key: string): boolean {
    this.keys.push(key);
    return this.decision;
  }
}

describe('LaunchpadController verification read endpoint', () => {
  let store: InMemoryVerificationStore;
  let limiter: RecordingLimiter;
  let controller: LaunchpadController;

  beforeEach(() => {
    store = new InMemoryVerificationStore();
    limiter = new RecordingLimiter(true);
    controller = new LaunchpadController(store, limiter);
  });

  it('boots empty: unknown id ⇒ DomainError 404 verification_artifact_not_found', async () => {
    const error = await controller
      .verificationArtifact('t21:unknown', { ip: '10.0.0.1' })
      .catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('verification_artifact_not_found');
    expect((error as DomainError).httpStatus).toBe(404);
  });

  it('serves a seeded artifact verbatim (id, hash, claims)', async () => {
    await store.put(ARTIFACT);
    const envelope = await controller.verificationArtifact(ARTIFACT.id, {
      ip: '10.0.0.1',
    });
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toEqual(ARTIFACT);
    expect(envelope.error).toBeNull();
  });

  it('consumes rate-limit budget under the client ip before serving', async () => {
    await controller
      .verificationArtifact('t21:unknown', { ip: '10.9.9.9' })
      .catch(() => undefined);
    expect(limiter.keys).toEqual(['10.9.9.9']);
  });

  it('over-budget client ⇒ DomainError 429 rate_limited (store untouched)', async () => {
    limiter = new RecordingLimiter(false);
    controller = new LaunchpadController(store, limiter);
    await store.put(ARTIFACT);
    const error = await controller
      .verificationArtifact(ARTIFACT.id, { ip: '10.0.0.1' })
      .catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('rate_limited');
    expect((error as DomainError).httpStatus).toBe(429);
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
