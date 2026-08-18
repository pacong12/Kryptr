import { Test } from '@nestjs/testing';
import { CreateTransferUseCase } from './create-transfer.usecase';
import { INTENT_STORE, POLICY_PROVIDER } from '../ports';

describe('CreateTransferUseCase', () => {
  let useCase: CreateTransferUseCase;
  let intentStoreMock: any;
  let policyProviderMock: any;

  beforeEach(async () => {
    intentStoreMock = { save: jest.fn() };
    policyProviderMock = { getPolicyForWallet: jest.fn().mockResolvedValue({ walletId: 'wallet-1' }) };

    const module = await Test.createTestingModule({
      providers: [
        CreateTransferUseCase,
        { provide: INTENT_STORE, useValue: intentStoreMock },
        { provide: POLICY_PROVIDER, useValue: policyProviderMock },
      ],
    }).compile();

    useCase = module.get(CreateTransferUseCase);
  });

  it('creates transfer intent when wallet exists', async () => {
    const result = await useCase.execute(
      'wallet-1',
      'base' as any,
      '0x1234567890123456789012345678901234567890' as `0x${string}`,
      null,
      '1000000',
      'user',
    );

    expect(result).toHaveProperty('id');
    expect(result.walletId).toBe('wallet-1');
    expect(result.kind).toBe('transfer');
    expect(intentStoreMock.save).toHaveBeenCalled();
  });

  it('throws when wallet does not exist', async () => {
    policyProviderMock.getPolicyForWallet.mockResolvedValue(null);

    await expect(
      useCase.execute(
        'nonexistent',
        'base' as any,
        '0x1234567890123456789012345678901234567890' as `0x${string}`,
        null,
        '1000000',
        'user',
      ),
    ).rejects.toThrow('wallet_not_found');
  });
});
