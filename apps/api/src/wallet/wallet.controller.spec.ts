import { Test, type TestingModule } from '@nestjs/testing';
import type { AgentWallet, WalletBalance } from '@kryptr/shared-types';
import { CreateWalletUseCase } from './application/create-wallet.usecase';
import { ListWalletsUseCase } from './application/list-wallets.usecase';
import { GetBalancesUseCase } from './application/get-balances.usecase';
import { WalletController } from './wallet.controller';
import { WalletNotFoundError } from './domain/wallet.errors';

const WALLET: AgentWallet = {
  id: 'wallet-1',
  address: '0x1111111111111111111111111111111111111111',
  ownerId: 'owner-1',
  chains: ['base'],
  createdAt: '2026-05-01T00:00:00.000Z',
  lastKeyRotationAt: null,
};

const BALANCES: WalletBalance[] = [
  {
    walletId: 'wallet-1',
    chain: 'base',
    nativeBalance: '1500000000000000000',
    tokens: [],
  },
];

describe('WalletController (envelope shape)', () => {
  let module: TestingModule;
  let controller: WalletController;
  let createWallet: { execute: jest.Mock };
  let listWallets: { execute: jest.Mock };
  let getBalances: { execute: jest.Mock };

  beforeAll(async () => {
    createWallet = { execute: jest.fn().mockResolvedValue(WALLET) };
    listWallets = { execute: jest.fn().mockResolvedValue([WALLET]) };
    getBalances = { execute: jest.fn().mockResolvedValue(BALANCES) };
    module = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        { provide: CreateWalletUseCase, useValue: createWallet },
        { provide: ListWalletsUseCase, useValue: listWallets },
        { provide: GetBalancesUseCase, useValue: getBalances },
      ],
    }).compile();
    controller = module.get(WalletController);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    createWallet.execute.mockResolvedValue(WALLET);
    listWallets.execute.mockResolvedValue([WALLET]);
    getBalances.execute.mockResolvedValue(BALANCES);
  });

  afterAll(async () => {
    await module.close();
  });

  it('POST /wallets wraps the created wallet in an ok() envelope', async () => {
    const envelope = await controller.create({
      ownerId: 'owner-1',
      address: WALLET.address,
      chains: ['base'],
    });
    expect(envelope).toEqual({ ok: true, data: WALLET, error: null });
    expect(createWallet.execute).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      address: WALLET.address,
      chains: ['base'],
    });
  });

  it('GET /wallets wraps the list in an ok() envelope and forwards no filter', async () => {
    const envelope = await controller.list(undefined);
    expect(envelope).toEqual({ ok: true, data: [WALLET], error: null });
    expect(listWallets.execute).toHaveBeenCalledWith(undefined);
  });

  it('GET /wallets?ownerId= forwards the filter', async () => {
    await controller.list('owner-1');
    expect(listWallets.execute).toHaveBeenCalledWith({ ownerId: 'owner-1' });
  });

  it('GET /wallets/:id/balances wraps balances in an ok() envelope', async () => {
    const envelope = await controller.balances('wallet-1');
    expect(envelope).toEqual({ ok: true, data: BALANCES, error: null });
    expect(getBalances.execute).toHaveBeenCalledWith('wallet-1');
  });

  it('propagates domain errors for the global envelope filter', async () => {
    getBalances.execute.mockRejectedValue(new WalletNotFoundError('missing'));
    await expect(controller.balances('missing')).rejects.toBeInstanceOf(
      WalletNotFoundError,
    );
  });
});
