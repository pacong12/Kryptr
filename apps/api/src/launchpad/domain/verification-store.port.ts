import type { VerificationArtifactRef } from '@kryptr/shared-types';

/**
 * Canonical T21 verification artifacts (decision condition 1 + FaceUI
 * flag). The consent chip fetches the artifact for the id embedded in
 * the DeployContext, re-compares hash + claims, and renders only what
 * it verified; the gate performs the server-side parity check against
 * the same store. Boots EMPTY — artifacts are seeded when the T21
 * battery lands (factory era); until then every lookup fails closed.
 */

export const VERIFICATION_STORE = 'launchpad.verification-store';

export interface VerificationArtifactStore {
  get(id: string): Promise<VerificationArtifactRef | null>;
  /** Seeding seam (tests + the factory-era T21 wiring). */
  put(artifact: VerificationArtifactRef): Promise<void>;
}
