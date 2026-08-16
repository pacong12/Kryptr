import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ApiEnvelopeExceptionFilter } from '../common/api-envelope.exception-filter';
import request from 'supertest';
import type { VerificationArtifactRef } from '@kryptr/shared-types';
import { AppModule } from '../app/app.module';
import { VERIFICATION_STORE } from './domain/verification-store.port';

/**
 * HTTP-level route specs for GET /launchpad/verification/:id
 * (SecReview68 fix batch):
 * - C2: T21 ids are frozen as t21:<chain>:<releaseTag> and release tags
 *   MAY contain '/' (doc example t21:base:contracts/v1.0.0). The route
 *   must deliver the whole id — a bare :param stops at the first slash,
 *   so the controller uses a wildcard tail.
 * - C4: unauthenticated public endpoint ⇒ fixed-window rate limit
 *   (anti-enumeration), 429 + stable code when exceeded.
 * - C5: unknown ids answer HTTP 404 with the envelope error (repo
 *   convention DomainError + status via the global envelope filter),
 *   never a 200 carrying ok:false.
 */

const SLASH_ID = 't21:base:contracts/v1.0.0';
const ARTIFACT: VerificationArtifactRef = {
  id: SLASH_ID,
  hash: '0xdeadbeef',
  claims: [{ claim: 'admin_key_free', verifiedAt: '2026-08-01T00:00:00.000Z' }],
};
describe('launchpad verification route (AppModule over HTTP)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    // Mirror main.ts: the global prefix and the envelope filter are what
    // turn DomainError(404/429) into envelope answers with real status.
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new ApiEnvelopeExceptionFilter());
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('C5: unknown id ⇒ HTTP 404 + envelope verification_artifact_not_found', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/launchpad/verification/t21:unknown')
      .expect(404);
    expect(res.body.ok).toBe(false);
    expect(res.body.error?.code).toBe('verification_artifact_not_found');
  });

  it('C2: an id containing "/" round-trips (route delivers the tail)', async () => {
    // Unseeded first: 404 with OUR envelope code proves the wildcard
    // route matched the slash id (a routing miss would answer http_error).
    const miss = await request(app.getHttpServer())
      .get(`/api/launchpad/verification/${encodeURIComponent(SLASH_ID)}`)
      .expect(404);
    expect(miss.body.error?.code).toBe('verification_artifact_not_found');

    await app.get(VERIFICATION_STORE).put(ARTIFACT);
    const hit = await request(app.getHttpServer())
      .get(`/api/launchpad/verification/${encodeURIComponent(SLASH_ID)}`)
      .expect(200);
    expect(hit.body.ok).toBe(true);
    expect(hit.body.data).toEqual(ARTIFACT);
  });

  it('C4: exceeding the fixed-window limit ⇒ HTTP 429 + rate_limited', async () => {
    // The window budget is per client ip; supertest shares one. Drain
    // whatever the previous tests consumed, then trip the limit.
    let limited: {
      status: number;
      body: { error?: { code?: string } };
    } | null = null;
    for (let i = 0; i < 100 && limited === null; i += 1) {
      const res = await request(app.getHttpServer()).get(
        '/api/launchpad/verification/t21:enumerate-probe',
      );
      if (res.status === 429) {
        limited = res;
      }
    }
    expect(limited).not.toBeNull();
    expect(limited?.status).toBe(429);
    expect(limited?.body.error?.code).toBe('rate_limited');
  });
});
