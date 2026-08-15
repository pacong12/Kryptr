import type { AgentWallet } from '@kryptr/shared-types';
import type { WalletRepository } from '../domain/wallet-repository.port';
import { ListWalletsUseCase } from './list-wallets.usecase';

const WALLETS: AgentWallet[] = [
  {
    id: 'wallet-1',
    address: '0x1111111111111111111111111111111111111111',
    ownerId: 'owner-1',
    chains: ['base'],
    createdAt: '2026-05-01T00:00:00.000Z',
    lastKeyRotationAt: null,
  },
  {
    id: 'wallet-2',
    address: '0x2222222222222222222222222222222222222222',
    ownerId: 'owner-2',
    chains: ['robinhood-chain'],
    createdAt: '2026-05-02T00:00:00.000Z',
    lastKeyRotationAt: null,
  },
];

describe('ListWalletsUseCase', () => {
  it('returns every wallet when no filter is given', async () => {
    const wallets: jest.Mocked<WalletRepository> = {
      save: jest.fn(),
      findById: jest.fn(),
      findByAddress: jest.fn(),
      findAll: jest.fn().mockResolvedValue(WALLETS),
    };
    const useCase = new ListWalletsUseCase(wallets);
    await expect(useCase.execute()).resolves.toEqual(WALLETS);
    expect(wallets.findAll).toHaveBeenCalledWith(undefined);
  });

  it('forwards the ownerId filter to the repository', async () => {
    const wallets: jest.Mocked<WalletRepository> = {
      save: jest.fn(),
      findById: jest.fn(),
      findByAddress: jest.fn(),
      findAll: jest.fn().mockResolvedValue([WALLETS[1]]),
    };
    const useCase = new ListWalletsUseCase(wallets);
    await expect(useCase.execute({ ownerId: 'owner-2' })).resolves.toEqual([
      WALLETS[1],
    ]);
    expect(wallets.findAll).toHaveBeenCalledWith({ ownerId: 'owner-2' });
  });
});
