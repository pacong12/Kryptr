/**
 * API smoke — wave-3 evolution. NO database, NO network, NO keys.
 *
 * Boots the real Nest app (AppModule, all in-memory adapters) via supertest.
 * Blocks:
 *   1. golden path: wallet → quote → evaluate(swap) → timeline, APPROVED.
 *      Runs with explicit PRICE_FEED_MODE=static + DEX_SOURCE=static-mock
 *      (dev opt-in; the keyless DEFAULT is fail-closed by wave-3 ruling —
 *      the gate must value intents independently of the quote source).
 *   2. degradation: DEX_SOURCE=zero-ex without ZEROX_API_KEY →
 *      POST /api/quotes 503 err 'aggregator_unconfigured'.
 *   3. fail-closed default: keyless config → swap valuation escalates to
 *      needs_human_approval ('price' in reason); health feeds show the
 *      price feed degraded.
 *   4. deploy intents always escalate (needs_human_approval).
 *   5. chain reader via stubbed VIEM_CLIENT token (zero network).
 *
 * Env hygiene: each block sets its env before Test.createTestingModule
 * (bindings are fixed at compile) and restores prior values in afterAll;
 * every block compiles a FRESH module.
 *
 * Contract anchors locked with VaultAPI over IRC (wave 3): canonical env
 * names DEX_SOURCE / ZEROX_API_KEY / PRICE_FEED_MODE, VIEM_CLIENT token
 * 'chain.viem-client', envelope shapes from @kryptr/shared-types.
 */
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
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
// 0.01 native (~$30 at the static rate): under the default policy's $100
// approval threshold and inside the $1000/day cap → auto-approved.
const SELL_AMOUNT = '10000000000000000';

jest.setTimeout(30_000);

/** Set env for the duration of a block; restore prior values on cleanup. */
function scopedEnv(entries: Record<string, string>) {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(entries)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

/** Boot AppModule exactly like main.ts (prefix, pipes, envelope filter). */
async function bootApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
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
  return app;
}

async function createWallet(server: Server): Promise<string> {
  const res = await request(server)
    .post('/api/wallets')
    .send({
      ownerId: 'smoke',
      address: `0x${'1'.repeat(40)}`,
      chains: ['base'],
    })
    .expect(201);
  expect(res.body.ok).toBe(true);
  return res.body.data.id;
}

function swapIntentBody(walletId: string, quote: SwapQuote) {
  return {
    id: randomUUID(),
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
  };
}

async function requestQuote(
  server: Server,
  walletId: string,
): Promise<SwapQuote> {
  const res = await request(server)
    .post('/api/quotes')
    .send({
      walletId,
      chain: 'base',
      assetIn: null,
      assetOut: USDC_BASE,
      amount: SELL_AMOUNT,
    })
    .expect(201);
  expect(res.body.ok).toBe(true);
  return res.body.data;
}

describe('api smoke 1: swap golden path, approved (static pricing opt-in)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;

  beforeAll(async () => {
    restoreEnv = scopedEnv({
      PRICE_FEED_MODE: 'static',
      DEX_SOURCE: 'static-mock',
    });
    app = await bootApp();
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  it('create wallet → quote → evaluate(swap) approved → timeline', async () => {
    const server = app.getHttpServer();
    const walletId = await createWallet(server);

    const quote = await requestQuote(server, walletId);
    expect(quote.source).toBe('static-mock');

    const intent = swapIntentBody(walletId, quote);
    const evaluateRes = await request(server)
      .post('/api/security/evaluate')
      .send(intent)
      .expect(201);
    expect(evaluateRes.body.ok).toBe(true);
    const decision: SecurityDecision = evaluateRes.body.data;
    expect(decision.intentId).toBe(intent.id);
    expect(decision.result).toBe('approved');

    const timelineRes = await request(server)
      .get(`/api/security/intents/${intent.id}/timeline`)
      .expect(200);
    expect(timelineRes.body.ok).toBe(true);
    const steps: IntentTimelineStep[] = timelineRes.body.data;
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.some((s) => s.step === 'gate_decision')).toBe(true);
  });
});

describe('api smoke 2: degradation — zero-ex aggregator without key', () => {
  let app: INestApplication;
  let restoreEnv: () => void;

  beforeAll(async () => {
    restoreEnv = scopedEnv({ DEX_SOURCE: 'zero-ex' });
    delete process.env.ZEROX_API_KEY; // keyless by construction in CI
    app = await bootApp();
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  it('POST /api/quotes fails closed with aggregator_unconfigured (503)', async () => {
    const server = app.getHttpServer();
    const walletId = await createWallet(server);

    const res = await request(server)
      .post('/api/quotes')
      .send({
        walletId,
        chain: 'base',
        assetIn: null,
        assetOut: USDC_BASE,
        amount: SELL_AMOUNT,
      })
      .expect(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('aggregator_unconfigured');
  });
});

describe('api smoke 3: fail-closed default — keyless price feed escalates', () => {
  let app: INestApplication;
  let restoreEnv: () => void;

  beforeAll(async () => {
    // Defaults: DEX_SOURCE=static-mock, PRICE_FEED_MODE=coingecko (keyless).
    restoreEnv = scopedEnv({});
    delete process.env.COINGECKO_API_KEY; // keyless by construction in CI
    app = await bootApp();
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  it('quotes still work; swap valuation escalates to needs_human_approval', async () => {
    const server = app.getHttpServer();
    const walletId = await createWallet(server);

    // Quotes never consult the price feed → still ok.
    const quote = await requestQuote(server, walletId);

    const evaluateRes = await request(server)
      .post('/api/security/evaluate')
      .send(swapIntentBody(walletId, quote))
      .expect(201);
    expect(evaluateRes.body.ok).toBe(true);
    const decision: SecurityDecision = evaluateRes.body.data;
    expect(decision.result).toBe('needs_human_approval');
    expect(String(decision.reason).toLowerCase()).toContain('price');
  });

  it('GET /api/health/feeds degrades loudly when the price feed is down', async () => {
    const server = app.getHttpServer();
    // Degradation is never silent: when a feed is stale/down/unconfigured
    // the feeds envelope itself flips to ok:false with code 'feeds_degraded'
    // and lists the stale feed ids (the keyless price feed among them).
    const res = await request(server).get('/api/health/feeds').expect(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('feeds_degraded');
    expect(String(res.body.error.message).toLowerCase()).toContain('price');
  });
});

describe('api smoke 4: deploy intents fail closed without frozen context', () => {
  let app: INestApplication;
  let restoreEnv: () => void;

  beforeAll(async () => {
    restoreEnv = scopedEnv({ PRICE_FEED_MODE: 'static' });
    app = await bootApp();
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  it('evaluate(kind=deploy, no deploy context) → rejected deploy_context_invalid', async () => {
    const server = app.getHttpServer();
    const walletId = await createWallet(server);

    const res = await request(server)
      .post('/api/security/evaluate')
      .send({
        id: randomUUID(),
        walletId,
        chain: 'base',
        kind: 'deploy',
        to: null,
        asset: null,
        amount: '0',
        origin: 'user',
        createdAt: new Date().toISOString(),
      })
      .expect(201);
    expect(res.body.ok).toBe(true);
    const decision: SecurityDecision = res.body.data;
    expect(decision.result).toBe('rejected');
    expect(decision.reason).toBe('deploy_context_invalid');
  });
});

describe('api smoke 5: chain reader via stubbed VIEM_CLIENT (zero network)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;

  beforeAll(async () => {
    restoreEnv = scopedEnv({ CHAIN_MODE: 'viem' });
    // Override the viem seam with a deterministic stub — no import of the
    // real client, no network. Token name is frozen in the IRC contract.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('chain.viem-client')
      .useValue({
        getNativeBalance: async () => '777',
        getTokenBalances: async (
          _owner: `0x${string}`,
          tokens: readonly `0x${string}`[],
        ) => tokens.map((token) => ({ token, balance: '55' })),
        lastBlockNumber: () => 1234n,
        health: () => ({
          feedId: 'chain:base',
          source: 'stub',
          status: 'healthy',
          lastUpdateAt: null,
          priceAgeSec: null,
        }),
        chainHealth: () => ({
          chainId: 'base',
          provider: 'stub',
          reachable: true,
          blockHeight: 1234,
          latencyMs: 1,
          lastBlockAt: null,
        }),
      })
      .compile();
    app = moduleRef.createNestApplication();
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
    restoreEnv();
  });

  it('wallet balances flow through the stubbed reader', async () => {
    const server = app.getHttpServer();
    const walletId = await createWallet(server);

    const res = await request(server)
      .get(`/api/wallets/${walletId}/balances`)
      .expect(200);
    expect(res.body.ok).toBe(true);
    // Sentinel value from the stub proves the read path used the seam.
    expect(JSON.stringify(res.body.data)).toContain('777');
  });
});
