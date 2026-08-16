import { Test, type TestingModule } from '@nestjs/testing';
import type {
  IntentTimelineStep,
  SecurityDecision,
} from '@kryptr/shared-types';
import { EvaluateIntentUseCase } from './application/evaluate-intent.usecase';
import { GetIntentTimelineUseCase } from './application/get-intent-timeline.usecase';
import {
  PreviewSwapExecutionUseCase,
  type SwapExecutionPreview,
} from '../trading/application/preview-swap-execution.usecase';
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

const TIMELINE: IntentTimelineStep[] = [
  {
    step: 'created',
    at: '2026-05-01T00:00:00.000Z',
    actor: 'user',
    detail: 'swap intent received',
  },
];

const PREVIEW: SwapExecutionPreview = {
  intentId: 'intent-1',
  quoteId: 'quote-1',
  chain: 'base',
  to: '0x1111111111111111111111111111111111111111',
  data: '0xabcdef',
  value: '1000',
  signed: false,
  note: 'Unsigned execution preview only. This API never signs transactions.',
};

describe('SecurityController (envelope shape)', () => {
  let module: TestingModule;
  let controller: SecurityController;
  let evaluateIntent: { execute: jest.Mock };
  let getIntentTimeline: { execute: jest.Mock };
  let previewSwapExecution: { execute: jest.Mock };

  beforeAll(async () => {
    evaluateIntent = { execute: jest.fn().mockResolvedValue(DECISION) };
    getIntentTimeline = { execute: jest.fn().mockResolvedValue(TIMELINE) };
    previewSwapExecution = { execute: jest.fn().mockResolvedValue(PREVIEW) };
    module = await Test.createTestingModule({
      controllers: [SecurityController],
      providers: [
        { provide: EvaluateIntentUseCase, useValue: evaluateIntent },
        { provide: GetIntentTimelineUseCase, useValue: getIntentTimeline },
        {
          provide: PreviewSwapExecutionUseCase,
          useValue: previewSwapExecution,
        },
      ],
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

  it('GET /security/intents/:id/timeline wraps steps in an ok() envelope', async () => {
    await expect(controller.timeline('intent-1')).resolves.toEqual({
      ok: true,
      data: TIMELINE,
      error: null,
    });
    expect(getIntentTimeline.execute).toHaveBeenCalledWith('intent-1');
  });

  it('GET /security/intents/:id/execution-preview wraps the unsigned preview', async () => {
    const envelope = await controller.executionPreview('intent-1');
    expect(envelope).toEqual({ ok: true, data: PREVIEW, error: null });
    expect(envelope.data?.signed).toBe(false);
    expect(previewSwapExecution.execute).toHaveBeenCalledWith('intent-1');
  });
});
