import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { CHAIN_READER } from '../chain/chain-reader.port';
import { StaticMockChainReader } from '../chain/static-mock-chain.reader';
import { RealViemClient } from '../chain/real-viem.client';
import { StaticViemClient } from '../chain/static-viem.client';
import { VIEM_CLIENT } from '../chain/viem-client.port';
import { ViemChainReader } from '../chain/viem-chain.reader';
import { WALLET_REPOSITORY } from '../wallet/domain/wallet-repository.port';
import { InMemoryWalletRepository } from '../wallet/infrastructure/in-memory-wallet.repository';
import {
  DECISION_AUDIT,
  INTENT_STORE,
  POLICY_PROVIDER,
  PRICE_FEED,
  SPEND_LEDGER,
} from '../security/application/ports';
import { StaticPriceFeed } from '../security/infrastructure/static-price-feed';
import { CoingeckoPriceFeed } from '../security/infrastructure/coingecko-price-feed';
import { InMemorySpendLedger } from '../security/infrastructure/in-memory-spend-ledger';
import { InMemorySecurityPolicyProvider } from '../security/infrastructure/in-memory-policy-provider';
import { InMemoryIntentStore } from '../security/infrastructure/in-memory-intent-store';
import { InMemoryDecisionAudit } from '../security/infrastructure/in-memory-decision-audit';
import { DEX_AGGREGATOR } from '../trading/domain/dex-aggregator.port';
import { QUOTE_STORE } from '../trading/domain/quote-store.port';
import { StaticMockDexAdapter } from '../trading/infrastructure/static-mock-dex.adapter';
import { ZeroExDexAdapter } from '../trading/infrastructure/zero-ex-dex.adapter';
import { InMemoryQuoteStore } from '../trading/infrastructure/in-memory-quote-store';
import { CreateWalletUseCase } from '../wallet/application/create-wallet.usecase';
import { EvaluateIntentUseCase } from '../security/application/evaluate-intent.usecase';

describe('AppModule composition (wiring smoke)', () => {
  let app: TestingModule;
  const ORIGINAL = {
    priceFeedMode: process.env.PRICE_FEED_MODE,
    chainMode: process.env.CHAIN_MODE,
    dexSource: process.env.DEX_SOURCE,
  };

  beforeAll(async () => {
    // Explicit dev opt-ins pin the DEFAULT wiring regardless of any local
    // .env (nx loads .env into task env; wave-3 defaults are
    // coingecko-configured-or-fail-closed / viem-when-configured).
    process.env.PRICE_FEED_MODE = 'static';
    process.env.CHAIN_MODE = 'static';
    process.env.DEX_SOURCE = 'static-mock';
    app = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterAll(async () => {
    await app.close();
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    };
    restore('PRICE_FEED_MODE', ORIGINAL.priceFeedMode);
    restore('CHAIN_MODE', ORIGINAL.chainMode);
    restore('DEX_SOURCE', ORIGINAL.dexSource);
  });

  it('binds every port to its in-memory implementation (zero overrides needed)', () => {
    expect(app.get(CHAIN_READER)).toBeInstanceOf(StaticMockChainReader);
    expect(app.get(WALLET_REPOSITORY)).toBeInstanceOf(InMemoryWalletRepository);
    expect(app.get(PRICE_FEED)).toBeInstanceOf(StaticPriceFeed);
    expect(app.get(SPEND_LEDGER)).toBeInstanceOf(InMemorySpendLedger);
    expect(app.get(POLICY_PROVIDER)).toBeInstanceOf(
      InMemorySecurityPolicyProvider,
    );
    expect(app.get(INTENT_STORE)).toBeInstanceOf(InMemoryIntentStore);
    expect(app.get(DECISION_AUDIT)).toBeInstanceOf(InMemoryDecisionAudit);
    expect(app.get(DEX_AGGREGATOR)).toBeInstanceOf(StaticMockDexAdapter);
    expect(app.get(QUOTE_STORE)).toBeInstanceOf(InMemoryQuoteStore);
  });
});

describe('AppModule wave-3 env wiring (fresh module per block)', () => {
  const saved: Record<string, string | undefined> = {};
  const OWNER = '0x4444444444444444444444444444444444444444';

  function setEnv(vars: Record<string, string | undefined>): void {
    for (const [key, value] of Object.entries(vars)) {
      if (!(key in saved)) {
        saved[key] = process.env[key];
      }
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  async function compileApp(): Promise<TestingModule> {
    return Test.createTestingModule({ imports: [AppModule] }).compile();
  }

  it('defaults the price feed to CoinGecko-configured-or-fail-closed', async () => {
    setEnv({ PRICE_FEED_MODE: undefined, COINGECKO_API_KEY: undefined });
    const app = await compileApp();
    const priceFeed = app.get<CoingeckoPriceFeed>(PRICE_FEED);
    expect(priceFeed).toBeInstanceOf(CoingeckoPriceFeed);
    expect(priceFeed.health().status).toBe('unconfigured');
    await expect(
      priceFeed.getUsdValue({
        id: 'i',
        walletId: 'w',
        chain: 'base',
        kind: 'transfer',
        to: '0x1111111111111111111111111111111111111111',
        asset: null,
        amount: '1',
        origin: 'user',
        createdAt: '2026-05-01T00:00:00.000Z',
      }),
    ).resolves.toBeNull();
    await app.close();
  });

  it('PRICE_FEED_MODE=static opts back into the dev static feed', async () => {
    setEnv({ PRICE_FEED_MODE: 'static' });
    const app = await compileApp();
    expect(app.get(PRICE_FEED)).toBeInstanceOf(StaticPriceFeed);
    await app.close();
  });

  it('DEX_SOURCE=zero-ex without a key binds 0x unconfigured (503, never fake)', async () => {
    setEnv({
      PRICE_FEED_MODE: 'static',
      DEX_SOURCE: 'zero-ex',
      ZEROX_API_KEY: undefined,
    });
    const app = await compileApp();
    const dex = app.get<ZeroExDexAdapter>(DEX_AGGREGATOR);
    expect(dex).toBeInstanceOf(ZeroExDexAdapter);
    expect(dex.health().status).toBe('unconfigured');
    await expect(
      dex.getQuote({
        walletId: 'w',
        taker: '0x5555555555555555555555555555555555555555',
        chain: 'base',
        assetIn: null,
        assetOut: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        amount: '1',
        slippageBps: 50,
      }),
    ).rejects.toMatchObject({
      code: 'aggregator_unconfigured',
      httpStatus: 503,
    });
    await app.close();
  });

  it('CHAIN_MODE=viem swaps the reader and seam without touching consumers', async () => {
    setEnv({ PRICE_FEED_MODE: 'static', CHAIN_MODE: 'viem' });
    const app = await compileApp();
    expect(app.get(CHAIN_READER)).toBeInstanceOf(ViemChainReader);
    expect(app.get(VIEM_CLIENT)).toBeInstanceOf(RealViemClient);
    await app.close();
  });

  it('default CHAIN_MODE stays static and zero-network', async () => {
    setEnv({ PRICE_FEED_MODE: 'static', CHAIN_MODE: undefined });
    const app = await compileApp();
    expect(app.get(CHAIN_READER)).toBeInstanceOf(StaticMockChainReader);
    expect(app.get(VIEM_CLIENT)).toBeInstanceOf(StaticViemClient);
    await app.close();
  });

  it('keyless default: price-based HITL + fail-closed wave-5 deploy posture', async () => {
    setEnv({
      PRICE_FEED_MODE: undefined,
      COINGECKO_API_KEY: undefined,
      DEX_SOURCE: undefined,
      CHAIN_MODE: undefined,
    });
    const app = await compileApp();
    const wallet = await app.get(CreateWalletUseCase).execute({
      ownerId: 'default-owner',
      address: OWNER,
      chains: ['base'],
    });
    const base = {
      walletId: wallet.id,
      chain: 'base' as const,
      origin: 'user',
      createdAt: '2026-05-01T00:00:00.000Z',
      asset: null,
      amount: '1000',
    };
    const transfer = await app.get(EvaluateIntentUseCase).execute({
      ...base,
      id: 'intent-transfer',
      kind: 'transfer',
      to: '0x5555555555555555555555555555555555555555',
    });
    expect(transfer.result).toBe('needs_human_approval');
    expect(transfer.reason).toContain('price');
    // Wave 5: a deploy WITHOUT a consent-frozen context is rejected
    // fail-closed (deploy_context_invalid), never escalated blind.
    const contextlessDeploy = await app.get(EvaluateIntentUseCase).execute({
      ...base,
      id: 'intent-deploy-contextless',
      kind: 'deploy',
      to: null,
    });
    expect(contextlessDeploy.result).toBe('rejected');
    expect(contextlessDeploy.reason).toBe('deploy_context_invalid');
    // Pre-launch posture: with no deploy manifests wired, even a fully
    // valid consent context hits the fail-closed factory allowlist —
    // the launchpad stays dark until a T21-verified factory lands.
    const factory =
      '0xaaaa000000000000000000000000000000000001' as `0x${string}`;
    const fullDeploy = await app.get(EvaluateIntentUseCase).execute({
      ...base,
      id: 'intent-deploy-full',
      kind: 'deploy',
      to: factory,
      amount: '0',
      deploy: {
        tokenName: 'Smoke Token',
        tokenSymbol: 'SMK1',
        totalSupply: '1000000',
        factory,
        feeSchedule: {
          creatorShare: 0.007,
          lpShare: 0.005,
          protocolShare: 0.0049,
          buybackShare: 0.0006,
        },
        feeBps: { creator: 70, lp: 50, protocol: 49, buyback: 6 },
        feeRecipients: {
          creator: '0x1111111111111111111111111111111111111111',
          lp: '0x2222222222222222222222222222222222222222',
          protocol: '0x3333333333333333333333333333333333333333',
          buyback: '0x4444444444444444444444444444444444444444',
        },
        bondPaid: true,
        verification: {
          id: 't21:factory-base:v1',
          hash: '0xdeadbeef',
          claims: [
            { claim: 'admin_key_free', verifiedAt: '2026-08-01T00:00:00.000Z' },
          ],
        },
      },
    });
    expect(fullDeploy.result).toBe('rejected');
    expect(fullDeploy.reason).toBe('factory_not_allowlisted');
    await app.close();
  });
});
