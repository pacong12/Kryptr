import type { SwapQuote, TransactionIntent } from '@kryptr/shared-types';
import type {
  DecisionAudit,
  DecisionAuditEntry,
  IntentStore,
} from '../../security/application/ports';
import type {
  DexAggregatorPort,
  UnsignedSwapTx,
} from '../domain/dex-aggregator.port';
import type { QuoteStore } from '../domain/quote-store.port';
import { PreviewSwapExecutionUseCase } from './preview-swap-execution.usecase';

const QUOTE: SwapQuote = {
  id: 'quote-1',
  source: 'static-mock',
  chain: 'base',
  assetIn: null,
  assetOut: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  amountIn: '10000000000000000',
  amountOut: '30000000',
  price: 3000,
  minAmountOut: '29850000',
  slippageBps: 50,
  route: [],
  fetchedAt: '2026-05-01T00:00:00.000Z',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

const SWAP_INTENT: TransactionIntent = {
  id: 'intent-1',
  walletId: 'wallet-1',
  chain: 'base',
  kind: 'swap',
  to: null,
  asset: null,
  amount: QUOTE.amountIn,
  origin: 'user',
  createdAt: '2026-05-01T00:00:00.000Z',
  swap: {
    quoteId: 'quote-1',
    buyAsset: QUOTE.assetOut,
    minBuyAmount: QUOTE.minAmountOut,
    maxSlippageBps: 100,
    quoteExpiresAt: QUOTE.expiresAt,
  },
};

const TX: UnsignedSwapTx = {
  to: '0x1111111111111111111111111111111111111111',
  data: '0xabcdef',
  value: QUOTE.amountIn,
};

function auditEntry(
  overrides: Partial<DecisionAuditEntry>,
): DecisionAuditEntry {
  return {
    id: 'decision-1',
    intentId: 'intent-1',
    result: 'approved',
    reason: 'approved: within policy',
    decidedAt: '2026-05-01T00:00:05.000Z',
    decisionUsd: 30,
    ...overrides,
  };
}

describe('PreviewSwapExecutionUseCase', () => {
  let intentStore: jest.Mocked<IntentStore>;
  let decisionAudit: jest.Mocked<DecisionAudit>;
  let quoteStore: jest.Mocked<QuoteStore>;
  let dex: jest.Mocked<DexAggregatorPort>;
  let useCase: PreviewSwapExecutionUseCase;

  beforeEach(() => {
    intentStore = {
      save: jest.fn(),
      findById: jest.fn().mockResolvedValue(SWAP_INTENT),
    };
    decisionAudit = {
      append: jest.fn(),
      findByIntentId: jest.fn().mockResolvedValue([auditEntry({})]),
      appendSignEvent: jest.fn(),
      findSignEventsByIntentId: jest.fn().mockResolvedValue([]),
    };
    quoteStore = {
      save: jest.fn(),
      findById: jest
        .fn()
        .mockResolvedValue({ quote: QUOTE, boundIntentId: 'intent-1' }),
      bind: jest.fn(),
    };
    dex = {
      getQuote: jest.fn(),
      buildSwapTx: jest.fn().mockResolvedValue(TX),
      health: jest.fn(),
    };
    useCase = new PreviewSwapExecutionUseCase(
      intentStore,
      decisionAudit,
      quoteStore,
      dex,
    );
  });

  it('builds an unsigned-calldata preview for an approved swap intent', async () => {
    const preview = await useCase.execute('intent-1');
    expect(preview).toMatchObject({
      intentId: 'intent-1',
      quoteId: 'quote-1',
      chain: 'base',
      signed: false,
      ...TX,
    });
    expect(preview.note.toLowerCase()).toContain('unsigned');
    expect(dex.buildSwapTx).toHaveBeenCalledWith(QUOTE);
  });

  it('rejects unknown intents with a 404 domain error', async () => {
    intentStore.findById.mockResolvedValue(null);
    await expect(useCase.execute('nope')).rejects.toMatchObject({
      code: 'intent_not_found',
      httpStatus: 404,
    });
  });

  it('rejects non-swap intents', async () => {
    intentStore.findById.mockResolvedValue({
      ...SWAP_INTENT,
      kind: 'transfer',
      swap: undefined,
    });
    await expect(useCase.execute('intent-1')).rejects.toMatchObject({
      code: 'not_a_swap_intent',
    });
  });

  it('rejects intents without any gate decision', async () => {
    decisionAudit.findByIntentId.mockResolvedValue([]);
    await expect(useCase.execute('intent-1')).rejects.toMatchObject({
      code: 'decision_not_found',
    });
    expect(dex.buildSwapTx).not.toHaveBeenCalled();
  });

  it('rejects when the latest decision is not approved', async () => {
    decisionAudit.findByIntentId.mockResolvedValue([
      auditEntry({ id: 'decision-1', result: 'approved' }),
      auditEntry({
        id: 'decision-2',
        result: 'needs_human_approval',
        decidedAt: '2026-05-01T00:01:00.000Z',
      }),
    ]);
    await expect(useCase.execute('intent-1')).rejects.toMatchObject({
      code: 'decision_not_approved',
    });
  });

  it('honors the latest decision after escalation then approval', async () => {
    decisionAudit.findByIntentId.mockResolvedValue([
      auditEntry({ id: 'decision-1', result: 'needs_human_approval' }),
      auditEntry({
        id: 'decision-2',
        result: 'approved',
        decidedAt: '2026-05-01T00:01:00.000Z',
      }),
    ]);
    await expect(useCase.execute('intent-1')).resolves.toMatchObject({
      intentId: 'intent-1',
    });
  });

  it('rejects when the bound quote is gone', async () => {
    quoteStore.findById.mockResolvedValue(null);
    await expect(useCase.execute('intent-1')).rejects.toMatchObject({
      code: 'quote_not_found',
      httpStatus: 410,
    });
  });

  it('rejects when the approved decision outlived the quote TTL', async () => {
    quoteStore.findById.mockResolvedValue({
      quote: { ...QUOTE, expiresAt: new Date(Date.now() - 1000).toISOString() },
      boundIntentId: 'intent-1',
    });
    await expect(useCase.execute('intent-1')).rejects.toMatchObject({
      code: 'quote_expired',
      httpStatus: 410,
    });
    expect(dex.buildSwapTx).not.toHaveBeenCalled();
  });

  it('F2: refuses when the quote is bound to a DIFFERENT intent', async () => {
    quoteStore.findById.mockResolvedValue({
      quote: QUOTE,
      boundIntentId: 'intent-OTHER',
    });
    await expect(useCase.execute('intent-1')).rejects.toMatchObject({
      code: 'quote_not_bound',
      httpStatus: 409,
    });
    expect(dex.buildSwapTx).not.toHaveBeenCalled();
  });
});
