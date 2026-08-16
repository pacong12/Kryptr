import type { TransactionIntent } from '@kryptr/shared-types';
import { InMemoryIntentStore } from './in-memory-intent-store';

const INTENT: TransactionIntent = {
  id: 'intent-1',
  walletId: 'wallet-1',
  chain: 'base',
  kind: 'transfer',
  to: '0x1111111111111111111111111111111111111111',
  asset: null,
  amount: '1000',
  origin: 'user',
  createdAt: '2026-05-01T00:00:00.000Z',
};

describe('InMemoryIntentStore', () => {
  it('saves and finds intents by id', async () => {
    const store = new InMemoryIntentStore();
    await store.save(INTENT);
    await expect(store.findById('intent-1')).resolves.toEqual(INTENT);
  });

  it('returns null for unknown ids', async () => {
    const store = new InMemoryIntentStore();
    await expect(store.findById('nope')).resolves.toBeNull();
  });

  it('upserts on re-save (re-evaluation keeps the latest shape)', async () => {
    const store = new InMemoryIntentStore();
    await store.save(INTENT);
    await store.save({ ...INTENT, amount: '2000' });
    await expect(store.findById('intent-1')).resolves.toMatchObject({
      amount: '2000',
    });
  });
});
