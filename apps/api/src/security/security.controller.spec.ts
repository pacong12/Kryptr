import { Test, type TestingModule } from '@nestjs/testing';
import type { SecurityDecision } from '@kryptr/shared-types';
import { EvaluateIntentUseCase } from './application/evaluate-intent.usecase';
import { SecurityController } from './security.controller';
import type { EvaluateIntentDto } from './dto/evaluate-intent.dto';

const DECISION: SecurityDecision = {
  intentId: 'intent-1',
  result: 'approved',
  reason: 'approved: within policy',
  decidedAt: '2026-05-01T00:00:01.000Z',
};

const INTENT: EvaluateIntentDto = {
  id: 'intent-1',
  walletId: 'wallet-1',
  chain: 'base',
  kind: 'transfer',
  to: '0x1111111111111111111111111111111111111111',
  asset: null,
  amount: '100000000000000000',
  origin: 'user',
  createdAt: '2026-05-01T00:00:00.000Z',
};

describe('SecurityController (envelope shape)', () => {
  let module: TestingModule;
  let controller: SecurityController;
  let evaluateIntent: { execute: jest.Mock };

  beforeAll(async () => {
    evaluateIntent = { execute: jest.fn().mockResolvedValue(DECISION) };
    module = await Test.createTestingModule({
      controllers: [SecurityController],
      providers: [{ provide: EvaluateIntentUseCase, useValue: evaluateIntent }],
    }).compile();
    controller = module.get(SecurityController);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    evaluateIntent.execute.mockResolvedValue(DECISION);
  });

  afterAll(async () => {
    await module.close();
  });

  it('POST /security/evaluate wraps the decision in an ok() envelope', async () => {
    const envelope = await controller.evaluate(INTENT);
    expect(envelope).toEqual({ ok: true, data: DECISION, error: null });
    expect(evaluateIntent.execute).toHaveBeenCalledWith(INTENT);
  });

  it('never produces a bare (un-enveloped) response', async () => {
    evaluateIntent.execute.mockResolvedValue({
      ...DECISION,
      result: 'rejected',
    });
    const envelope = await controller.evaluate(INTENT);
    expect(Object.keys(envelope).sort()).toEqual(['data', 'error', 'ok']);
    expect(envelope.data).toMatchObject({ result: 'rejected' });
  });
});
