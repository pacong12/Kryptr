import { Test } from '@nestjs/testing';
import { DCASlotExecutionUseCase } from './dca-execution.usecase';
import { ORDER_STORE, EXECUTION_STORE } from './ports';

describe('DCASlotExecutionUseCase', () => {
  let useCase: DCASlotExecutionUseCase;
  let orderStoreMock: any;
  let executionStoreMock: any;

  beforeEach(async () => {
    orderStoreMock = { findById: jest.fn(), save: jest.fn() };
    executionStoreMock = { 
      findForSlot: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        DCASlotExecutionUseCase,
        { provide: ORDER_STORE, useValue: orderStoreMock },
        { provide: EXECUTION_STORE, useValue: executionStoreMock },
      ],
    }).compile();

    useCase = module.get(DCASlotExecutionUseCase);
  });

  it('executes DCA slot when within time window', async () => {
    const mockOrder = {
      id: 'order-123',
      type: 'dca' as const,
      walletId: 'wallet-1',
      chain: 'base' as any,
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      asset: null,
      amount: '0x1000000',
      createdAtMs: Date.now() - 100_000,
      intervalMs: 86_400_000, // Daily
      slotsCount: 10,
    };

    orderStoreMock.findById.mockResolvedValue(mockOrder);

    const result = await useCase.execute({
      orderId: 'order-123',
      slotKey: new Date(Date.now() - 50_000).toISOString(),
    });

    expect(result.status).toBe('executed');
    expect(result.intentId).toContain('dca-order-123');
    expect(executionStoreMock.create).toHaveBeenCalled();
  });

  it('returns duplicate when execution already recorded', async () => {
    orderStoreMock.findById.mockRejectedValue(new Error());
    executionStoreMock.findForSlot.mockResolvedValue({
      intentId: 'intent-abc',
      executedAmount: '0x500000',
    });

    const result = await useCase.execute({
      orderId: 'order-123',
      slotKey: new Date().toISOString(),
    });

    expect(result.status).toBe('duplicate');
    expect(result.intentId).toBe('intent-abc');
    expect(orderStoreMock.findById).not.toHaveBeenCalled();
  });

  it('throws when order not found', async () => {
    orderStoreMock.findById.mockResolvedValue(null);
    executionStoreMock.findForSlot.mockResolvedValue(null);

    await expect(
      useCase.execute({
        orderId: 'nonexistent',
        slotKey: new Date().toISOString(),
      }),
    ).rejects.toThrow('order_not_found');
  });

  it('throws when order type is not DCA', async () => {
    const nonDCAOrder = { ...{}, type: 'limit' as const };
    orderStoreMock.findById.mockResolvedValue(nonDCAOrder);
    executionStoreMock.findForSlot.mockResolvedValue(null);

    await expect(
      useCase.execute({
        orderId: 'order-123',
        slotKey: new Date().toISOString(),
      }),
    ).rejects.toThrow('invalid_order_type');
  });

  it('skips when slot is outside execution window', async () => {
    const mockOrder = {
      id: 'order-123',
      type: 'dca' as const,
      walletId: 'wallet-1',
      chain: 'base' as any,
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      asset: null,
      amount: '0x1000000',
      createdAtMs: Date.now(),
      intervalMs: 86_400_000,
      slotsCount: 10,
    };

    orderStoreMock.findById.mockResolvedValue(mockOrder);
    executionStoreMock.findForSlot.mockResolvedValue(null);

    const result = await useCase.execute({
      orderId: 'order-123',
      slotKey: new Date(Date.now() + 86_400_000).toISOString(), // Future slot
    });

    expect(result.status).toBe('skipped');
  });
});
