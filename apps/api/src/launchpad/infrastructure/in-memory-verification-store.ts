import { Injectable } from '@nestjs/common';
import type { VerificationArtifactRef } from '@kryptr/shared-types';
import type { VerificationArtifactStore } from '../domain/verification-store.port';

/**
 * In-memory canonical artifact store. Boots EMPTY (wave-4 store
 * convention): no artifact is trusted until it is seeded explicitly.
 * The Postgres/ops-artifact era swaps this binding in the module.
 */
@Injectable()
export class InMemoryVerificationStore implements VerificationArtifactStore {
  private readonly artifacts = new Map<string, VerificationArtifactRef>();

  async get(id: string): Promise<VerificationArtifactRef | null> {
    return this.artifacts.get(id) ?? null;
  }

  async put(artifact: VerificationArtifactRef): Promise<void> {
    this.artifacts.set(artifact.id, artifact);
  }
}
