import { Test, type TestingModule } from '@nestjs/testing';
import type { TransactionIntent } from '@kryptr/shared-types';
import { AppModule } from './app.module';
import { CreateWalletUseCase } from '../wallet/application/create-wallet.usecase';
import { RequestQuoteUseCase } from '../trading/application/request-quote.usecase';
import { GetQuoteUseCase } from '../trading/application/get-quote.usecase';
import { PreviewSwapExecutionUseCase } from '../trading/application/preview-swap-execution.usecase';
import { EvaluateIntentUseCase } from '../security/application/evaluate-intent.usecase';
import { GetIntentTimelineUseCase } from '../security/application/get-intent-timeline.usecase';
import { GetFeedHealthUseCase } from '../security/application/get-feed-health.usecase';

/**
 * End-to-end flow over the REAL in-memory bindings (zero provider
 * overrides — the same promise the smoke target relies on):
 * wallet -> quote -> gate evaluation -> timeline -> unsigned preview,
 * plus the single-use quote rule.
 */
describe('swap flow (AppModule integration, zero overrides)', () => {
  let app: TestingModule;
  let walletId: string;
  const originalPriceFeedMode = process.env.PRICE_FEED_MODE;

  beforeAll(async () => {
    // Explicit dev opt-in: the wave-3 default price feed is
    // coingecko-configured-or-fail-closed and would escalate this flow.
    process.env.PRICE_FEED_MODE = 'static';
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const wallet = await app.get(CreateWalletUseCase).execute({
      ownerId: 'flow-owner',
      address: '0x3333333333333333333333333333333333333333',
      chains: ['base'],
    });
    walletId = wallet.id;
  });

  afterAll(async () => {
    await app.close();
    if (originalPriceFeedMode === undefined) {
      delete process.env.PRICE_FEED_MODE;
    } else {
      process.env.PRICE_FEED_MODE = originalPriceFeedMode;
    }
  });

  it('runs quote -> approved decision -> timeline -> unsigned preview', async () => {
    // 1. quote (0.01 base native; $30 < $100 threshold)
    const quote = await app.get(RequestQuoteUseCase).execute({
      walletId,
      chain: 'base',
      assetIn: null,
      assetOut: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      amount: '10000000000000000',
      slippageBps: 50,
    });
    expect(quote.id).toEqual(expect.any(String));
    await expect(app.get(GetQuoteUseCase).execute(quote.id)).resolves.toEqual(
      quote,
    );

    // 2. gate evaluation with matching swap context -> approved
    const intent: TransactionIntent = {
      id: 'flow-intent-1',
      walletId,
      chain: 'base',
      kind: 'swap',
      to: null,
      asset: quote.assetIn,
      amount: quote.amountIn,
      origin: 'user',
      createdAt: new Date().toISOString(),
      swap: {
        quoteId: quote.id,
        buyAsset: quote.assetOut,
        minBuyAmount: quote.minAmountOut,
        maxSlippageBps: quote.slippageBps,
        quoteExpiresAt: quote.expiresAt,
      },
    };
    const decision = await app.get(EvaluateIntentUseCase).execute(intent);
    expect(decision.result).toBe('approved');

    // 3. timeline shows creation + the gate decision
    const steps = await app.get(GetIntentTimelineUseCase).execute(intent.id);
    expect(steps.map((step) => step.step)).toEqual([
      'created',
      'gate_decision',
    ]);
    expect(steps[1].detail).toBe(decision.reason);

    // 4. approved intent yields an UNSIGNED preview
    const preview = await app
      .get(PreviewSwapExecutionUseCase)
      .execute(intent.id);
    expect(preview.signed).toBe(false);
    expect(preview.quoteId).toBe(quote.id);
    expect(preview.to).toMatch(/^0x[0-9a-f]{40}$/);
    expect(preview.data).toMatch(/^0x[0-9a-f]+$/);
    expect(preview.value).toBe(quote.amountIn);
  });

  it('enforces single-use quotes: a second intent cannot reuse the bound quote', async () => {
    const quote = await app.get(RequestQuoteUseCase).execute({
      walletId,
      chain: 'base',
      assetIn: null,
      assetOut: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      amount: '20000000000000000',
      slippageBps: 50,
    });
    const buildIntent = (id: string): TransactionIntent => {
      return {
        id,
        walletId,
        chain: 'base',
        kind: 'swap',
        to: null,
        asset: quote.assetIn,
        amount: quote.amountIn,
        origin: 'user',
        createdAt: new Date().toISOString(),
        swap: {
          quoteId: quote.id,
          buyAsset: quote.assetOut,
          minBuyAmount: quote.minAmountOut,
          maxSlippageBps: quote.slippageBps,
          quoteExpiresAt: quote.expiresAt,
        },
      };
    };
    const first = await app
      .get(EvaluateIntentUseCase)
      .execute(buildIntent('flow-intent-2'));
    expect(first.result).toBe('approved');
    const second = await app
      .get(EvaluateIntentUseCase)
      .execute(buildIntent('flow-intent-3'));
    expect(second.result).toBe('rejected');
    expect(second.reason).toContain('already bound');
  });

  it('reports healthy feeds (price + dex + chain) before any staleness', async () => {
    const report = await app.get(GetFeedHealthUseCase).execute();
    expect(report.degraded).toBe(false);
    expect(report.feeds.map((feed) => feed.feedId)).toEqual([
      'price:static',
      'dex:static-mock',
      'chain:base',
    ]);
  });
});
