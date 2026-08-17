import { InMemorySignRequestStore } from './in-memory-sign-request-store';
import type { SignRequest } from '@kryptr/shared-types';

describe('InMemorySignRequestStore', () => {
  const makeRequest = (over: Partial<SignRequest> = {}): SignRequest => ({
    id: 'sr-1',
    intentId: 'intent-1',
    status: 'pending',
    unsignedTx: {
      to: '0x0000000000000000000000000000000000000001',
      data: '0x',
      value: '0x0',
    },
    digest: null,
    note: 'dry-run only — nothing broadcast',
    createdAt: '2026-08-17T00:00:00.000Z',
    ...over,
  });

  it('createIfAbsent stores once; the second call for the same intent returns null', async () => {
    const store = new InMemorySignRequestStore();
    await expect(store.createIfAbsent(makeRequest())).resolves.toMatchObject({
      id: 'sr-1',
    });
    await expect(
      store.createIfAbsent(makeRequest({ id: 'sr-2' })),
    ).resolves.toBeNull();
    await expect(store.findByIntentId('intent-1')).resolves.toMatchObject({
      id: 'sr-1',
    });
  });

  it('markStatus updates and rejects unknown ids', async () => {
    const store = new InMemorySignRequestStore();
    await store.createIfAbsent(makeRequest());
    await expect(store.markStatus('sr-1', 'signed')).resolves.toMatchObject({
      status: 'signed',
    });
    await expect(store.markStatus('missing', 'signed')).resolves.toBeNull();
  });

  it('findById and findByIntentId return null when absent', async () => {
    const store = new InMemorySignRequestStore();
    await expect(store.findById('nope')).resolves.toBeNull();
    await expect(store.findByIntentId('nope')).resolves.toBeNull();
  });
});
