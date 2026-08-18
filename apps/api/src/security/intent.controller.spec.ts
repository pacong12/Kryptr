import { Test } from '@nestjs/testing';
import type { TransactionIntent } from '@kryptr/shared-types';
import { IntentController } from './intent.controller';
import { CreateTransferUseCase } from './application/create-transfer.usecase';
import { GetIntentUseCase } from './application/get-intent.usecase';

describe('IntentController', () => {
  let controller: IntentController;
  let createTransferMock: ReturnType<typeof jest.fn>;
  let getIntentMock: ReturnType<typeof jest.fn>;

  beforeEach(async () => {
    createTransferMock = { execute: jest.fn() };
    getIntentMock = { execute: jest.fn() };

    const module = await Test.createTestingModule({
      controllers: [IntentController],
      providers: [
        { provide: CreateTransferUseCase, useValue: createTransferMock },
        { provide: GetIntentUseCase, useValue: getIntentMock },
      ],
    }).compile();

    controller = module.get(IntentController);
  });

  describe('POST /intents', () => {
    it('creates a transfer intent through security gate', async () => {
      const mockIntent: TransactionIntent = {
        id: 'intent-abc',
        walletId: 'wallet-1',
        chain: 'base' as any,
        kind: 'transfer',
        to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        asset: null,
        amount: '1000000',
        origin: 'user',
        createdAt: new Date().toISOString(),
      };

      createTransferMock.execute.mockResolvedValue(mockIntent);

      const result = await controller.createTransfer(
        'wallet-1',
        'base',
        '0x1234567890123456789012345678901234567890',
        null,
        '1000000',
        'user',
      );

      expect(createTransferMock.execute).toHaveBeenCalled();
      expect(result.ok).toBe(true);
      expect(result.data.id).toBe('intent-abc');
    });
  });

  describe('GET /intents/:id', () => {
    it('returns intent by id', async () => {
      const mockIntent: TransactionIntent = {
        id: 'intent-abc',
        walletId: 'wallet-1',
        chain: 'base' as any,
        kind: 'transfer',
        to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        asset: null,
        amount: '1000000',
        origin: 'user',
        createdAt: new Date().toISOString(),
      };

      getIntentMock.execute.mockResolvedValue(mockIntent);

      const result = await controller.getById('intent-abc');

      expect(getIntentMock.execute).toHaveBeenCalledWith('intent-abc');
      expect(result.ok).toBe(true);
      expect(result.data.id).toBe('intent-abc');
    });

    it('throws when intent not found', async () => {
      getIntentMock.execute.mockRejectedValue(new Error('intent_not_found'));

      await expect(controller.getById('nonexistent')).rejects.toThrow('intent_not_found');
    });
  });

  describe('GET /intents', () => {
    it('requires walletId query parameter', async () => {
      await expect(controller.list()).rejects.toThrow('walletId query parameter is required');
    });
  });
});
