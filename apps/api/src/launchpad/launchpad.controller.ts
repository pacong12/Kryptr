import { Controller, Get, Inject, Param } from '@nestjs/common';
import {
  err,
  ok,
  type ApiEnvelope,
  type VerificationArtifactRef,
} from '@kryptr/shared-types';
import {
  VERIFICATION_STORE,
  type VerificationArtifactStore,
} from './domain/verification-store.port';

/**
 * Launchpad read surface (wave-5 deploy-gate branch, doc §2 item 4).
 * GET /launchpad/verification/:id serves the canonical T21 artifact so
 * the consent chip can render ONLY what it fetches + verifies: fetch by
 * the id embedded in the DeployContext, compare hash + claims, render.
 * Unknown ids fail closed with an explicit envelope error — the chip
 * must never render an unfetched artifact.
 */
@Controller('launchpad')
export class LaunchpadController {
  constructor(
    @Inject(VERIFICATION_STORE)
    private readonly verificationStore: VerificationArtifactStore,
  ) {}

  @Get('verification/:id')
  async verificationArtifact(
    @Param('id') id: string,
  ): Promise<ApiEnvelope<VerificationArtifactRef>> {
    const artifact = await this.verificationStore.get(id);
    if (artifact === null) {
      return err({
        code: 'verification_artifact_not_found',
        message: `no canonical verification artifact for id "${id}"`,
        agentHint:
          'The deploy context references an artifact that is not seeded. Deploys against it fail closed (verification_missing) until the T21 battery seeds it.',
      });
    }
    return ok(artifact);
  }
}
