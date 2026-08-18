import { describePostgres } from '../../test/env-gate';
import {
  disconnectTestClient,
  makePostgresTestClient,
  truncateAllTables,
} from '../../test/postgres-harness';
import { PostgresSigner } from './postgres-signer';
import type { PrismaClient } from '../../generated/prisma/client';
import type { UnsignedTxPreview } from '@kryptr/shared-types';

describePostgres('PostgresSigner (S2, live Postgres)', () => {
  let db: PrismaClient;
  let signer: PostgresSigner;

  const preview: UnsignedTxPreview = {
    to: '0x0000000000000000000000000000000000000002',
    value: '0x0',
    data: '0x1234',
  };

  beforeEach(async () => {
    db = makePostgresTestClient();
    await truncateAllTables(db);
    signer = new PostgresSigner(db);
  });

  afterEach(async () => {
    await disconnectTestClient(db);
  });

  it('creates and retrieves sign request by intent id', async () => {
    const request = await signer.requestSignature({
      intentId: 'intent-1',
      chain: 'base',
      preview,
    });

    expect(request).toMatchObject({
      id: 'sr-intent-1',
      intentId: 'intent-1',
      status: 'dry_run',
      unsignedTx: preview,
    });

    const status = await signer.getStatus('intent-1');
    expect(status).toMatchObject({
      intentId: 'intent-1',
      digest: request.digest,
    });
  });

  it('idempotent signature request on same intentId', async () => {
    const req1 = await signer.requestSignature({
      intentId: 'intent-1',
      chain: 'base',
      preview,
    });

    const req2 = await signer.requestSignature({
      intentId: 'intent-1',
      chain: 'base',
      preview,
    });

    expect(req1.id).toBe(req2.id);
    expect(req1.digest).toBe(req2.digest);
  });
});
