import { Test } from '@nestjs/testing';
import { LimitSlotExecutionUseCase } from './limit-execution.usecase';
import { ORDER_STORE, EXECUTION_STORE } from './ports';
import { TRIGGER_PRICE } from '../domain/trigger-price.port';

describe('LimitSlotExecutionUseCase', () => {
  let useCase: LimitSlotExecutionUseCase;
  let orderStoreMock: any;
  let executionStoreMock: any;
  let triggerPriceMock: any;

  beforeEach(async () => {
    orderStoreMock = { findById: jest.fn(), save: jest.fn() };
    executionStoreMock = { 
      findForOrder: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
    };
    triggerPriceMock = { getCurrent: jest.fn().mockResolvedValue(1500) };

    const module = await Test.createTestingModule({
      providers: [
        LimitSlotExecutionUseCase,
        { provide: ORDER_STORE, useValue: orderStoreMock },
        { provide: EXECUTION_STORE, useValue: executionStoreMock },
        { provide: TRIGGER_PRICE, useValue: triggerPriceMock },
      ],
    }).compile();

    useCase = module.get(LimitSlotExecutionUseCase);
  });

  it('executes limit order when price reaches threshold', async () => {
    const mockOrder = {
      id: 'order-456',
      type: 'limit' as const,
      walletId: 'wallet-1',
      chain: 'base' as any,
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      asset: null,
      amount: '0x2000000',
      limitPriceMs: 2000, // Current price 1500 <= 2000, so trigger
      createdAt: new Date().toISOString(),
    };

    orderStoreMock.findById.mockResolvedValue(mockOrder);
    triggerPriceMock.getCurrent.mockResolvedValue(1500);

    const result = await useCase.execute({ orderId: 'order-456' });

    expect(result.status).toBe('executed');
    expect(result.intentId).toContain('limit-order-456');
    expect(executionStoreMock.create).toHaveBeenCalled();
  });

  it('skips when price not reached yet', async () => {
    const mockOrder = {
      id: 'order-456',
      type: 'limit' as const,
      walletId: 'wallet-1',
      chain: 'base' as any,
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      asset: null,
      amount: '0x2000000',
      limitPriceMs: 1000, // Current price 1500 > 1000, so no trigger
      createdAt: new Date().toISOString(),
    };

    orderStoreMock.findById.mockResolvedValue(mockOrder);
    triggerPriceMock.getCurrent.mockResolvedValue(1500);

    const result = await useCase.execute({ orderId: 'order-456' });

    expect(result.status).toBe('price_not_reached');
  });

  it('returns duplicate when already executed', async () => {
    orderStoreMock.findById.mockRejectedValue(new Error());
    executionStoreMock.findForOrder.mockResolvedValue({
      intentId: 'intent-def',
      executedAmount: '0x1000000',
    });

    const result = await useCase.execute({ orderId: 'order-456' });

    expect(result.status).toBe('duplicate');
    expect(result.intentId).toBe('intent-def');
  });

  it('throws when order not found', async () => {
    orderStoreMock.findById.mockResolvedValue(null);
    executionStoreMock.findForOrder.mockResolvedValue(null);

    await expect(useCase.execute({ orderId: 'nonexistent' }))
      .rejects.toThrow('order_not_found');
  });

  it('skips when order type is not limit', async () => {
    const dcaOrder = { ...{}, type: 'dca' as const };
    orderStoreMock.findById.mockResolvedValue(dcaOrder);
    executionStoreMock.findForOrder.mockResolvedValue(null);

    await expect(useCase.execute({ orderId: 'order-123' }))
      .rejects.toThrow('invalid_order_type');
  });

  it('skips when price retrieval fails', async () => {
    const mockOrder = {
      id: 'order-456',
      type: 'limit' as const,
      createdAt: new Date().toISOString(),
    };

    orderStoreMock.findById.mockResolvedValue(mockOrder);
    executionStoreMock.findForOrder.mockResolvedValue(null);
    triggerPriceMock.getCurrent.mockRejectedValue(new Error('RPC error'));

    const result = await useCase.execute({ orderId: 'order-456' });

    expect(result.status).toBe('skipped');
  });
});
