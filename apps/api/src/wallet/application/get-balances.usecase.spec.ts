import type { AgentWallet, TokenHolding } from '@kryptr/shared-types';
import type { WalletRepository } from '../domain/wallet-repository.port';
import { WalletNotFoundError } from '../domain/wallet.errors';
import type { ChainReader } from '../../chain/chain-reader.port';
import { GetBalancesUseCase } from './get-balances.usecase';

const WALLET: AgentWallet = {
  id: 'wallet-1',
  address: '0x1111111111111111111111111111111111111111',
  ownerId: 'owner-1',
  chains: ['base', 'robinhood-chain'],
  createdAt: '2026-05-01T00:00:00.000Z',
  lastKeyRotationAt: null,
};

const USDC: TokenHolding = {
  contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  symbol: 'USDC',
  decimals: 6,
  amount: '2500000000',
};

describe('GetBalancesUseCase', () => {
  let wallets: jest.Mocked<WalletRepository>;
  let chainReader: jest.Mocked<ChainReader>;
  let useCase: GetBalancesUseCase;

  beforeEach(() => {
    wallets = {
      save: jest.fn(),
      findById: jest.fn().mockResolvedValue(WALLET),
      findByAddress: jest.fn(),
      findAll: jest.fn(),
    };
    chainReader = {
      getNativeBalance: jest
        .fn()
        .mockImplementation((chain: string) =>
          Promise.resolve(chain === 'base' ? '1500000000000000000' : '0'),
        ),
      getTokenBalances: jest
        .fn()
        .mockImplementation((chain: string) =>
          Promise.resolve(chain === 'base' ? [USDC] : []),
        ),
    };
    useCase = new GetBalancesUseCase(wallets, chainReader);
  });

  it('throws WalletNotFoundError for unknown wallets', async () => {
    wallets.findById.mockResolvedValue(null);
    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(
      WalletNotFoundError,
    );
  });

  it('builds one WalletBalance per wallet chain via the ChainReader port', async () => {
    const balances = await useCase.execute('wallet-1');
    expect(balances).toEqual([
      {
        walletId: 'wallet-1',
        chain: 'base',
        nativeBalance: '1500000000000000000',
        tokens: [USDC],
      },
      {
        walletId: 'wallet-1',
        chain: 'robinhood-chain',
        nativeBalance: '0',
        tokens: [],
      },
    ]);
    expect(chainReader.getNativeBalance).toHaveBeenCalledTimes(2);
    expect(chainReader.getTokenBalances).toHaveBeenCalledTimes(2);
  });
});
