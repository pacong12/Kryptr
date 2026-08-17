import { InMemoryLaunchRecordStore } from './in-memory-launch-record-store';
import { DomainError } from '../../common/domain-error';

describe('InMemoryLaunchRecordStore', () => {
  const baseRecord = {
    id: 'deploy-1',
    stage: 'template' as const,
    chain: 'base',
    releaseTag: 'contracts-v0.1.0',
    commitSha: 'c0fcbcaa9ca9395570914a4450a12473ac34af66',
    payloadFile: 'deploy-kit-out/template-deploy.json',
    calldataKeccak: '0x00',
    expectedNonce: null,
    decodedConstructorArgs: null,
    frozenConstants: null,
  };

  it('publishes into status=published and reads back', async () => {
    const store = new InMemoryLaunchRecordStore();
    const record = await store.publish(baseRecord);
    expect(record.status).toBe('published');
    await expect(store.findById('deploy-1')).resolves.toMatchObject({
      stage: 'template',
      status: 'published',
    });
  });

  it('duplicate publish ids fail closed', async () => {
    const store = new InMemoryLaunchRecordStore();
    await store.publish(baseRecord);
    await expect(store.publish(baseRecord)).rejects.toThrow(DomainError);
  });

  it('enforces the forward-only lifecycle fail-closed', async () => {
    const store = new InMemoryLaunchRecordStore();
    await store.publish(baseRecord);
    await expect(
      store.transition('deploy-1', { status: 'signed_offchain' }),
    ).resolves.toMatchObject({ status: 'signed_offchain' });
    await expect(
      store.transition('deploy-1', { status: 'broadcast' }),
    ).resolves.toMatchObject({ status: 'broadcast' });
    await expect(
      store.transition('deploy-1', { status: 'readback_passed' }),
    ).resolves.toMatchObject({ status: 'readback_passed' });
    // terminal: repeat and backward both fail
    await expect(
      store.transition('deploy-1', { status: 'readback_passed' }),
    ).rejects.toThrow(DomainError);
    await expect(
      store.transition('deploy-1', { status: 'broadcast' }),
    ).rejects.toThrow(DomainError);
  });

  it('broadcast can fall to readback_rejected; skipping steps throws', async () => {
    const store = new InMemoryLaunchRecordStore();
    await store.publish({ ...baseRecord, id: 'deploy-2' });
    await store.transition('deploy-2', { status: 'signed_offchain' });
    await store.transition('deploy-2', { status: 'broadcast' });
    await expect(
      store.transition('deploy-2', {
        status: 'readback_rejected',
        rejectionReason: 'readback mismatch',
      }),
    ).resolves.toMatchObject({ status: 'readback_rejected' });
    await store.publish({ ...baseRecord, id: 'deploy-3' });
    await expect(
      store.transition('deploy-3', { status: 'broadcast' }),
    ).rejects.toThrow(DomainError);
  });

  it('unknown ids throw', async () => {
    const store = new InMemoryLaunchRecordStore();
    await expect(
      store.transition('missing', { status: 'signed_offchain' }),
    ).rejects.toThrow(DomainError);
  });
});
