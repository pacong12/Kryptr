/**
 * API smoke — wave-2 golden path. NO database.
 *
 * Boots the real Nest app (AppModule, all in-memory adapters +
 * StaticMockDex) and walks the full trading path:
 *
 *   create wallet → POST /api/quotes → POST /api/security/evaluate
 *   (kind='swap') → GET /api/security/intents/:id/timeline
 *
 * Contract anchors are agreed with vault (wave 2): envelope shapes from
 * @kryptr/shared-types, minBuyAmount === quote.minAmountOut,
 * quoteExpiresAt === quote.expiresAt, timeline step 'gate_decision'.
 */
import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type {
  IntentTimelineStep,
  SecurityDecision,
  SwapQuote,
} from '@kryptr/shared-types';
import { AppModule } from '../app/app.module';
import { ApiEnvelopeExceptionFilter } from '../common/api-envelope.exception-filter';

// USDC on Base — in the StaticMockDex price table (base native → USDC).
const USDC_BASE = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
// 0.01 native (~$30 at the mock rate): under the default policy's $100
// approval threshold and well inside the $1000/day cap → auto-approved.
const SELL_AMOUNT = '10000000000000000';

jest.setTimeout(30_000);

describe('api smoke: swap golden path (in-memory, no DB)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirror bootstrap(): same prefix, pipes and filters as main.ts.
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new ApiEnvelopeExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('create wallet → quote → evaluate(swap) approved → timeline', async () => {
    const server = app.getHttpServer();

    // 1. Create wallet (auto-provisions the default security policy).
    const walletRes = await request(server)
      .post('/api/wallets')
      .send({
        ownerId: 'smoke',
        address: `0x${'1'.repeat(40)}`,
        chains: ['base'],
      })
      .expect(201);
    expect(walletRes.body.ok).toBe(true);
    const walletId: string = walletRes.body.data.id;
    expect(walletId).toBeTruthy();

    // 2. Request a quote (read-only; nothing is signed).
    const quoteRes = await request(server)
      .post('/api/quotes')
      .send({
        walletId,
        chain: 'base',
        assetIn: null,
        assetOut: USDC_BASE,
        amount: SELL_AMOUNT,
      })
      .expect(201);
    expect(quoteRes.body.ok).toBe(true);
    const quote: SwapQuote = quoteRes.body.data;
    expect(quote.id).toBeTruthy();
    expect(quote.source).toBe('static-mock');
    expect(quote.chain).toBe('base');
    expect(quote.minAmountOut).toBeTruthy();
    expect(quote.expiresAt).toBeTruthy();

    // 3. Bind the quote to a swap intent and run it through the gate.
    const intentId = randomUUID();
    const evaluateRes = await request(server)
      .post('/api/security/evaluate')
      .send({
        id: intentId,
        walletId,
        chain: 'base',
        kind: 'swap',
        to: null,
        asset: null,
        amount: SELL_AMOUNT,
        origin: 'user',
        createdAt: new Date().toISOString(),
        swap: {
          quoteId: quote.id,
          buyAsset: USDC_BASE,
          minBuyAmount: quote.minAmountOut,
          maxSlippageBps: quote.slippageBps,
          quoteExpiresAt: quote.expiresAt,
        },
      })
      .expect(201);
    expect(evaluateRes.body.ok).toBe(true);
    const decision: SecurityDecision = evaluateRes.body.data;
    expect(decision.intentId).toBe(intentId);
    expect(decision.result).toBe('approved');

    // 4. The decision must be auditable on the intent timeline.
    const timelineRes = await request(server)
      .get(`/api/security/intents/${intentId}/timeline`)
      .expect(200);
    expect(timelineRes.body.ok).toBe(true);
    const steps: IntentTimelineStep[] = timelineRes.body.data;
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.some((s) => s.step === 'gate_decision')).toBe(true);
  });
});
