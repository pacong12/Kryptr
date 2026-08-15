import type { AgentWallet } from '@kryptr/shared-types';
import { InMemoryWalletRepository } from './in-memory-wallet.repository';

function makeWallet(overrides: Partial<AgentWallet>): AgentWallet {
  return {
    id: 'wallet-1',
    address: '0x1111111111111111111111111111111111111111',
    ownerId: 'owner-1',
    chains: ['base'],
    createdAt: '2026-05-01T00:00:00.000Z',
    lastKeyRotationAt: null,
    ...overrides,
  };
}

describe('InMemoryWalletRepository', () => {
  let repo: InMemoryWalletRepository;

  beforeEach(() => {
    repo = new InMemoryWalletRepository();
  });

  it('saves and finds a wallet by id', async () => {
    const wallet = makeWallet({});
    await repo.save(wallet);
    await expect(repo.findById('wallet-1')).resolves.toEqual(wallet);
  });

  it('returns null for unknown ids and addresses', async () => {
    await expect(repo.findById('nope')).resolves.toBeNull();
    await expect(
      repo.findByAddress('0x9999999999999999999999999999999999999999'),
    ).resolves.toBeNull();
  });

  it('finds by address case-insensitively', async () => {
    const mixed = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B';
    await repo.save(makeWallet({ address: mixed as `0x${string}` }));
    await expect(
      repo.findByAddress(mixed.toLowerCase()),
    ).resolves.toMatchObject({ id: 'wallet-1' });
  });

  it('lists all wallets', async () => {
    await repo.save(makeWallet({}));
    await repo.save(
      makeWallet({
        id: 'wallet-2',
        address: '0x2222222222222222222222222222222222222222',
      }),
    );
    await expect(repo.findAll()).resolves.toHaveLength(2);
  });

  it('filters by ownerId', async () => {
    await repo.save(makeWallet({}));
    await repo.save(
      makeWallet({
        id: 'wallet-2',
        address: '0x2222222222222222222222222222222222222222',
        ownerId: 'owner-2',
      }),
    );
    const owned = await repo.findAll({ ownerId: 'owner-2' });
    expect(owned).toHaveLength(1);
    expect(owned[0].id).toBe('wallet-2');
  });

  it('save overwrites a wallet with the same id', async () => {
    await repo.save(makeWallet({}));
    await repo.save(makeWallet({ chains: ['base', 'robinhood-chain'] }));
    await expect(repo.findAll()).resolves.toHaveLength(1);
    await expect(repo.findById('wallet-1')).resolves.toMatchObject({
      chains: ['base', 'robinhood-chain'],
    });
  });
});
