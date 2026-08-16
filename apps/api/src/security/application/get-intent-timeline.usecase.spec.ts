import type { TransactionIntent } from '@kryptr/shared-types';
import type { DecisionAudit, IntentStore } from './ports';
import { GetIntentTimelineUseCase } from './get-intent-timeline.usecase';

const INTENT: TransactionIntent = {
  id: 'intent-1',
  walletId: 'wallet-1',
  chain: 'base',
  kind: 'swap',
  to: null,
  asset: null,
  amount: '1000',
  origin: 'agent:trader-1',
  createdAt: '2026-05-01T00:00:00.000Z',
};

describe('GetIntentTimelineUseCase', () => {
  let intentStore: jest.Mocked<IntentStore>;
  let decisionAudit: jest.Mocked<DecisionAudit>;
  let useCase: GetIntentTimelineUseCase;

  beforeEach(() => {
    intentStore = {
      save: jest.fn(),
      findById: jest.fn().mockResolvedValue(INTENT),
    };
    decisionAudit = {
      append: jest.fn(),
      findByIntentId: jest.fn().mockResolvedValue([]),
    };
    useCase = new GetIntentTimelineUseCase(intentStore, decisionAudit);
  });

  it('raises a 404 domain error for unknown intents', async () => {
    intentStore.findById.mockResolvedValue(null);
    await expect(useCase.execute('nope')).rejects.toMatchObject({
      code: 'intent_not_found',
      httpStatus: 404,
    });
  });

  it('returns the created step when no decision exists yet', async () => {
    await expect(useCase.execute('intent-1')).resolves.toEqual([
      {
        step: 'created',
        at: '2026-05-01T00:00:00.000Z',
        actor: 'agent:trader-1',
        detail: 'swap intent received',
      },
    ]);
  });

  it('appends one gate_decision step per audit entry, in order', async () => {
    decisionAudit.findByIntentId.mockResolvedValue([
      {
        id: 'decision-1',
        intentId: 'intent-1',
        result: 'needs_human_approval',
        reason: 'needs_human_approval: threshold',
        decidedAt: '2026-05-01T00:00:05.000Z',
        decisionUsd: 150,
      },
      {
        id: 'decision-2',
        intentId: 'intent-1',
        result: 'approved',
        reason: 'approved: within policy',
        decidedAt: '2026-05-01T00:01:00.000Z',
        decisionUsd: 150,
      },
    ]);
    const steps = await useCase.execute('intent-1');
    expect(steps.map((step) => step.step)).toEqual([
      'created',
      'gate_decision',
      'gate_decision',
    ]);
    expect(steps[1]).toMatchObject({
      actor: 'gate',
      at: '2026-05-01T00:00:05.000Z',
      detail: 'needs_human_approval: threshold',
    });
    expect(steps[2]).toMatchObject({
      actor: 'gate',
      detail: 'approved: within policy',
    });
  });
});
