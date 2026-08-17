import { describePostgres } from '../../test/env-gate';
import {
  disconnectTestClient,
  makePostgresTestClient,
  truncateAllTables,
} from '../../test/postgres-harness';
import { PostgresVerificationArtifactStore } from './postgres-verification-store';
import { PostgresDeployRecordStore } from './postgres-deploy-record-store';
import { DomainError } from '../../common/domain-error';
import type { PrismaClient } from '../../generated/prisma/client';
import type { VerificationArtifactRef } from '@kryptr/shared-types';

describePostgres(
  'PostgresVerificationArtifactStore (S1 §3.3, live Postgres)',
  () => {
    let db: PrismaClient;
    let store: PostgresVerificationArtifactStore;

    beforeEach(async () => {
      db = makePostgresTestClient();
      await truncateAllTables(db);
      store = new PostgresVerificationArtifactStore(db);
    });

    afterEach(async () => {
      await disconnectTestClient(db);
    });

    it('boots empty (fail-closed), round-trips a seeded artifact by id', async () => {
      await expect(store.get('t21:base:contracts-v0.1.0')).resolves.toBeNull();
      const artifact: VerificationArtifactRef = {
        id: 't21:base:contracts-v0.1.0',
        hash: '0x' + 'ab'.repeat(32),
        claims: [
          {
            claim: 'bytecode_deterministic' as never,
            evidence: 'tier-f/leg-3',
            verifiedAt: '2026-08-17T00:00:00.000Z',
          },
        ],
      };
      await store.put(artifact);
      await expect(store.get('t21:base:contracts-v0.1.0')).resolves.toEqual(
        artifact,
      );
    });

    it('put is an upsert: re-seeding replaces the artifact blob', async () => {
      const base: VerificationArtifactRef = {
        id: 't21:base:v2',
        hash: '0x' + '11'.repeat(32),
        claims: [],
      };
      await store.put(base);
      await store.put({ ...base, hash: '0x' + '22'.repeat(32) });
      await expect(store.get('t21:base:v2')).resolves.toMatchObject({
        hash: '0x' + '22'.repeat(32),
      });
    });
  },
);

describePostgres('PostgresDeployRecordStore (S1 §3.1, live Postgres)', () => {
  let db: PrismaClient;
  let store: PostgresDeployRecordStore;

  const baseRecord = {
    id: 'deploy-1',
    stage: 'factory' as const,
    chain: 'base',
    releaseTag: 'contracts-v0.1.0',
    commitSha: 'c0fcbcaa9ca9395570914a4450a12473ac34af66',
    payloadFile: 'deploy-kit-out/factory-deploy.json',
    calldataKeccak:
      '0x7cf04244d7d0d80224b9f60d5a079b928c1bbab569e2cc1417f13a9e0df2a30d',
    expectedNonce: 7,
    decodedConstructorArgs: { rate: 175 },
    frozenConstants: null,
  };

  beforeEach(async () => {
    db = makePostgresTestClient();
    await truncateAllTables(db);
    store = new PostgresDeployRecordStore(db);
  });

  afterEach(async () => {
    await disconnectTestClient(db);
  });

  it('publishes a record in status=published with its full payload', async () => {
    const record = await store.publish(baseRecord);
    expect(record.status).toBe('published');
    expect(record.expectedNonce).toBe(7);
    await expect(store.findById('deploy-1')).resolves.toMatchObject({
      stage: 'factory',
      decodedConstructorArgs: { rate: 175 },
      frozenConstants: null,
      status: 'published',
    });
  });

  it('walks the full forward lifecycle and rejects repeats/backward moves', async () => {
    await store.publish(baseRecord);
    await expect(
      store.transition('deploy-1', { status: 'signed_offchain' }),
    ).resolves.toMatchObject({ status: 'signed_offchain' });
    await expect(
      store.transition('deploy-1', {
        status: 'broadcast',
        txHash: '0x' + 'aa'.repeat(32),
      }),
    ).resolves.toMatchObject({
      status: 'broadcast',
      txHash: '0x' + 'aa'.repeat(32),
    });
    await expect(
      store.transition('deploy-1', {
        status: 'readback_passed',
        deployedAddress: '0x00e7bE21b70DD57bA2AAC3C32657304dDa6863C2',
      }),
    ).resolves.toMatchObject({
      status: 'readback_passed',
      deployedAddress: '0x00e7bE21b70DD57bA2AAC3C32657304dDa6863C2',
    });
    // terminal: repeat and backward both fail closed
    await expect(
      store.transition('deploy-1', { status: 'readback_passed' }),
    ).rejects.toThrow(DomainError);
    await expect(
      store.transition('deploy-1', { status: 'broadcast' }),
    ).rejects.toThrow(DomainError);
    const stored = await store.findById('deploy-1');
    expect(stored?.readbackAt).not.toBeNull();
  });

  it('broadcast can end in readback_rejected with a reason (recorded, never retried)', async () => {
    await store.publish({ ...baseRecord, id: 'deploy-2' });
    await store.transition('deploy-2', { status: 'signed_offchain' });
    await store.transition('deploy-2', { status: 'broadcast' });
    await expect(
      store.transition('deploy-2', {
        status: 'readback_rejected',
        rejectionReason: 'readback mismatch: runtime hash differs',
      }),
    ).resolves.toMatchObject({
      status: 'readback_rejected',
      rejectionReason: 'readback mismatch: runtime hash differs',
    });
    await expect(
      store.transition('deploy-2', { status: 'broadcast' }),
    ).rejects.toThrow(DomainError);
  });

  it('skipping steps is rejected fail-closed', async () => {
    await store.publish({ ...baseRecord, id: 'deploy-3' });
    await expect(
      store.transition('deploy-3', { status: 'broadcast' }),
    ).rejects.toThrow(DomainError);
  });

  it('transition on an unknown record throws fail-closed', async () => {
    await expect(
      store.transition('missing', { status: 'signed_offchain' }),
    ).rejects.toThrow(DomainError);
  });
});
