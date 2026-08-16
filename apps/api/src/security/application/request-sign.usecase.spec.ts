import type { SignRequest, TransactionIntent } from '@kryptr/shared-types';
import type { IntentStore, DecisionAudit } from './ports';
import type { QuoteStore } from '../../trading/domain/quote-store.port';
import type {
  DexAggregatorPort,
  UnsignedSwapTx,
} from '../../trading/domain/dex-aggregator.port';
import type { SignerPort } from '../../signing/domain/signer.port';
import { RequestSignatureUseCase } from './request-sign.usecase';

function intent(overrides: Partial<TransactionIntent>): TransactionIntent {
  return {
    id: 'intent-1',
    walletId: 'wallet-1',
    chain: 'base',
    kind: 'swap',
    to: null,
    asset: null,
    amount: '1000000000000000000',
    origin: 'user',
    createdAt: '2026-05-01T00:00:00.000Z',
    swap: {
      quoteId: 'quote-1',
      buyAsset: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      minBuyAmount: '2985000000',
      maxSlippageBps: 50,
      quoteExpiresAt: '2026-05-01T01:00:00.000Z',
    },
    ...overrides,
  };
}

const TX: UnsignedSwapTx = {
  to: '0x0000000000001fF3684f28c67538d4D072C22734',
  data: '0xdeadbeef',
  value: '1000000000000000000',
};

const SIGN_REQUEST: SignRequest = {
  id: 'dry-run-1',
  intentId: 'intent-1',
  status: 'dry_run',
  unsignedTx: { to: TX.to, data: TX.data, value: '0xde0b6b3a7640000' },
  digest: '0xabc',
  note: 'dry-run only — nothing broadcast',
  createdAt: '2026-05-01T00:00:10.000Z',
};

describe('RequestSignatureUseCase (approved-only sign requests)', () => {
  // Pinned clock: quote fixtures expire 2026-05-01T01:00Z; never let the
  // wall clock decide test outcomes.
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-01T00:00:05.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  let intentStore: jest.Mocked<IntentStore>;
  let decisionAudit: jest.Mocked<DecisionAudit>;
  let quoteStore: jest.Mocked<QuoteStore>;
  let dex: jest.Mocked<DexAggregatorPort>;
  let signer: jest.Mocked<SignerPort>;
  let useCase: RequestSignatureUseCase;

  beforeEach(() => {
    intentStore = {
      save: jest.fn(),
      findById: jest.fn().mockResolvedValue(intent({})),
    };
    decisionAudit = {
      append: jest.fn(),
      findByIntentId: jest.fn().mockResolvedValue([
        {
          id: 'decision-1',
          intentId: 'intent-1',
          result: 'approved',
          reason: 'approved: within policy',
          decidedAt: '2026-05-01T00:00:01.000Z',
          decisionUsd: 30,
        },
      ]),
      appendSignEvent: jest.fn().mockResolvedValue({} as never),
      findSignEventsByIntentId: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<DecisionAudit>;
    quoteStore = {
      save: jest.fn(),
      bind: jest.fn(),
      findById: jest.fn().mockResolvedValue({
        quote: {
          id: 'quote-1',
          source: 'static-mock',
          chain: 'base',
          assetIn: null,
          assetOut: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          amountIn: '1000000000000000000',
          amountOut: '3000000000',
          price: 3000,
          minAmountOut: '2985000000',
          slippageBps: 50,
          route: [],
          fetchedAt: '2026-05-01T00:00:00.000Z',
          expiresAt: '2026-05-01T01:00:00.000Z',
        },
        boundIntentId: 'intent-1',
      }),
    } as unknown as jest.Mocked<QuoteStore>;
    dex = {
      getQuote: jest.fn(),
      buildSwapTx: jest.fn().mockResolvedValue(TX),
      health: jest.fn(),
    } as unknown as jest.Mocked<DexAggregatorPort>;
    signer = {
      requestSignature: jest.fn().mockResolvedValue(SIGN_REQUEST),
      getStatus: jest.fn(),
    };
    useCase = new RequestSignatureUseCase(
      intentStore,
      decisionAudit,
      quoteStore,
      dex,
      signer,
    );
  });

  it('404s for unknown intents', async () => {
    intentStore.findById.mockResolvedValue(null);
    await expect(useCase.execute('nope')).rejects.toMatchObject({
      code: 'intent_not_found',
      httpStatus: 404,
    });
  });

  it('refuses intents without a gate decision', async () => {
    decisionAudit.findByIntentId.mockResolvedValue([]);
    await expect(useCase.execute('intent-1')).rejects.toMatchObject({
      code: 'decision_not_found',
    });
    expect(signer.requestSignature).not.toHaveBeenCalled();
  });

  it('refuses intents whose latest decision is not approved', async () => {
    decisionAudit.findByIntentId.mockResolvedValue([
      {
        id: 'decision-1',
        intentId: 'intent-1',
        result: 'needs_human_approval',
        reason: 'threshold',
        decidedAt: '2026-05-01T00:00:01.000Z',
        decisionUsd: 30,
      },
    ]);
    await expect(useCase.execute('intent-1')).rejects.toMatchObject({
      code: 'decision_not_approved',
      httpStatus: 403,
    });
    expect(signer.requestSignature).not.toHaveBeenCalled();
  });

  it('prepares a sign request for an approved swap with hex wei value', async () => {
    await expect(useCase.execute('intent-1')).resolves.toBe(SIGN_REQUEST);
    expect(signer.requestSignature).toHaveBeenCalledWith({
      intentId: 'intent-1',
      chain: 'base',
      preview: {
        to: TX.to,
        data: TX.data,
        value: '0xde0b6b3a7640000',
      },
    });
  });

  it('F2: refuses when the quote is bound to a DIFFERENT intent', async () => {
    quoteStore.findById.mockResolvedValue({
      quote: {
        id: 'quote-1',
        source: 'static-mock',
        chain: 'base',
        assetIn: null,
        assetOut: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        amountIn: '1000000000000000000',
        amountOut: '3000000000',
        price: 3000,
        minAmountOut: '2985000000',
        slippageBps: 50,
        route: [],
        fetchedAt: '2026-05-01T00:00:00.000Z',
        expiresAt: '2026-05-01T01:00:00.000Z',
      },
      boundIntentId: 'intent-OTHER',
    });
    await expect(useCase.execute('intent-1')).rejects.toMatchObject({
      code: 'quote_not_bound',
      httpStatus: 409,
    });
    expect(signer.requestSignature).not.toHaveBeenCalled();
  });

  it('appends sign_requested then dry_run_signed audit events', async () => {
    await useCase.execute('intent-1');
    const calls = decisionAudit.appendSignEvent.mock.calls.map(
      ([entry]) => entry.step,
    );
    expect(calls).toEqual(['sign_requested', 'dry_run_signed']);
  });

  it('fails closed on expired quotes without touching the signer', async () => {
    quoteStore.findById.mockResolvedValue({
      quote: {
        id: 'quote-1',
        source: 'static-mock',
        chain: 'base',
        assetIn: null,
        assetOut: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        amountIn: '1',
        amountOut: '1',
        price: 1,
        minAmountOut: '1',
        slippageBps: 0,
        route: [],
        fetchedAt: '2026-04-01T00:00:00.000Z',
        expiresAt: '2026-04-01T00:01:00.000Z',
      },
      boundIntentId: 'intent-1',
    });
    await expect(useCase.execute('intent-1')).rejects.toMatchObject({
      code: 'quote_expired',
      httpStatus: 410,
    });
    expect(signer.requestSignature).not.toHaveBeenCalled();
    expect(decisionAudit.appendSignEvent).not.toHaveBeenCalled();
  });

  it('prepares native transfers as {to, empty data, value}', async () => {
    intentStore.findById.mockResolvedValue(
      intent({
        kind: 'transfer',
        to: '0x2222222222222222222222222222222222222222',
        swap: undefined,
        amount: '255',
      }),
    );
    await useCase.execute('intent-1');
    expect(signer.requestSignature).toHaveBeenCalledWith({
      intentId: 'intent-1',
      chain: 'base',
      preview: {
        to: '0x2222222222222222222222222222222222222222',
        data: '0x',
        value: '0xff',
      },
    });
  });

  it('rejects unsupported kinds (deploy/approve/erc20 transfer) with 422', async () => {
    for (const overrides of [
      { kind: 'deploy', to: null, swap: undefined },
      { kind: 'approve', to: null, swap: undefined },
      {
        kind: 'transfer',
        to: '0x2222222222222222222222222222222222222222',
        asset: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        swap: undefined,
      },
    ] as Partial<TransactionIntent>[]) {
      intentStore.findById.mockResolvedValue(intent(overrides));
      await expect(useCase.execute('intent-1')).rejects.toMatchObject({
        code: 'sign_not_supported',
        httpStatus: 422,
      });
    }
    expect(signer.requestSignature).not.toHaveBeenCalled();
  });
});
