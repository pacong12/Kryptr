import type { AgentWallet, SecurityPolicy } from '@kryptr/shared-types';
import { WALLET_REPOSITORY } from '../domain/wallet-repository.port';
import type { WalletRepository } from '../domain/wallet-repository.port';
import {
  ChainNotAllowedError,
  InvalidAddressError,
  WalletExistsError,
} from '../domain/wallet.errors';
import { POLICY_PROVIDER } from '../../security/application/ports';
import type { SecurityPolicyProvider } from '../../security/application/ports';
import { CreateWalletUseCase } from './create-wallet.usecase';

describe('CreateWalletUseCase', () => {
  let wallets: jest.Mocked<WalletRepository>;
  let policies: jest.Mocked<SecurityPolicyProvider>;
  let useCase: CreateWalletUseCase;

  beforeEach(() => {
    wallets = {
      save: jest
        .fn()
        .mockImplementation((w: AgentWallet) => Promise.resolve(w)),
      findById: jest.fn().mockResolvedValue(null),
      findByAddress: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue([]),
    };
    policies = {
      getPolicyForWallet: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new CreateWalletUseCase(wallets, policies);
  });

  it('creates a wallet and provisions a fail-closed default policy', async () => {
    const wallet = await useCase.execute({
      ownerId: 'owner-1',
      address: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
      chains: ['base'],
    });

    expect(wallet.ownerId).toBe('owner-1');
    expect(wallet.id).not.toContain('ab5801a7d398351b8be11c439e05c5b3259aec9b');
    expect(wallets.save).toHaveBeenCalledWith(wallet);

    expect(policies.upsert).toHaveBeenCalledTimes(1);
    const policy = policies.upsert.mock.calls[0][0] as SecurityPolicy;
    expect(policy).toEqual({
      walletId: wallet.id,
      allowedOrigins: ['user'],
      approvalThresholdUsd: 100,
      dailyCapUsd: 1000,
      allowedChains: ['base'],
      rejectEncodedPayloads: true,
    });
  });

  it('rejects invalid addresses via the domain rule', async () => {
    await expect(
      useCase.execute({
        ownerId: 'owner-1',
        address: '0x123' as `0x${string}`,
        chains: ['base'],
      }),
    ).rejects.toBeInstanceOf(InvalidAddressError);
  });
  it('rejects chains outside the allowlist', async () => {
    await expect(
      useCase.execute({
        ownerId: 'owner-1',
        address: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
        chains: ['ethereum'],
      }),
    ).rejects.toBeInstanceOf(ChainNotAllowedError);
    expect(wallets.save).not.toHaveBeenCalled();
  });

  it('rejects a duplicate wallet for the same address', async () => {
    const existing: AgentWallet = {
      id: 'wallet-existing',
      address: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
      ownerId: 'owner-9',
      chains: ['base'],
      createdAt: '2026-01-01T00:00:00.000Z',
      lastKeyRotationAt: null,
    };
    wallets.findByAddress.mockResolvedValue(existing);
    await expect(
      useCase.execute({
        ownerId: 'owner-1',
        address: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
        chains: ['base'],
      }),
    ).rejects.toBeInstanceOf(WalletExistsError);
    expect(wallets.save).not.toHaveBeenCalled();
  });

  it('wires through the documented port tokens', () => {
    expect(WALLET_REPOSITORY).toBe('wallet.repository');
    expect(POLICY_PROVIDER).toBe('security.policy-provider');
  });
});
