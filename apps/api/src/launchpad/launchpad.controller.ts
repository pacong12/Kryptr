import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import {
  ok,
  type ApiEnvelope,
  type VerificationArtifactRef,
} from '@kryptr/shared-types';
import { DomainError } from '../common/domain-error';
import { RATE_LIMIT, type RateLimitPort } from './domain/rate-limit.port';
import {
  VERIFICATION_STORE,
  type VerificationArtifactStore,
} from './domain/verification-store.port';

/**
 * Launchpad read surface (wave-5 deploy-gate branch, doc §2 item 4).
 * GET /launchpad/verification/:id serves the canonical T21 artifact so
 * the consent chip can render ONLY what it fetches + verifies: fetch by
 * the id embedded in the DeployContext, compare hash + claims, render.
 * Unknown ids fail closed with HTTP 404 + envelope error — the chip
 * must never render an unfetched artifact.
 *
 * SecReview68:
 * - C2 — T21 ids are `t21:<chain>:<releaseTag>` and release tags may
 *   contain '/' (doc example `t21:base:contracts/v1.0.0`), so the id is
 *   captured by a wildcard tail, not a bare :param (which stops at '/').
 * - C4 — public unauthenticated endpoint ⇒ per-ip fixed-window budget
 *   (anti-enumeration); over-budget ⇒ 429 rate_limited.
 * - C5 — unknown ids throw DomainError(404); the global envelope filter
 *   answers the err() envelope with the matching status.
 */
@Controller('launchpad')
export class LaunchpadController {
  constructor(
    @Inject(VERIFICATION_STORE)
    private readonly verificationStore: VerificationArtifactStore,
    @Inject(RATE_LIMIT)
    private readonly rateLimit: RateLimitPort,
  ) {}

  @Get('verification/*id')
  async verificationArtifact(
    @Param('id') idParam: string | string[],
    @Req() req: { ip?: string },
  ): Promise<ApiEnvelope<VerificationArtifactRef>> {
    // Express 5 delivers a wildcard tail as a segment array. A %2F id
    // arrives as ONE decoded segment; a literal-slash path arrives as
    // several. Joining reconstructs the T21 id either way (C2).
    const id = Array.isArray(idParam) ? idParam.join('/') : idParam;
    if (!this.rateLimit.tryConsume(req.ip ?? 'unknown')) {
      throw new DomainError(
        'rate_limited',
        'too many verification artifact requests from this client',
        429,
      );
    }
    const artifact = await this.verificationStore.get(id);
    if (artifact === null) {
      throw new DomainError(
        'verification_artifact_not_found',
        `no canonical verification artifact for id "${id}"`,
        404,
      );
    }
    return ok(artifact);
  }
}
