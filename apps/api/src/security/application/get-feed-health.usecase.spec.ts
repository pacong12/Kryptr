import type { FeedHealth } from '@kryptr/shared-types';
import type { PriceFeedPort } from './ports';
import type { DexAggregatorPort } from '../../trading/domain/dex-aggregator.port';
import type { ViemClientPort } from '../../chain/viem-client.port';
import { GetFeedHealthUseCase } from './get-feed-health.usecase';

function feed(overrides: Partial<FeedHealth>): FeedHealth {
  return {
    feedId: 'price:static',
    source: 'static',
    status: 'healthy',
    lastUpdateAt: '2026-05-01T00:00:00.000Z',
    priceAgeSec: 5,
    ...overrides,
  };
}

describe('GetFeedHealthUseCase', () => {
  let priceFeed: jest.Mocked<PriceFeedPort>;
  let dex: jest.Mocked<DexAggregatorPort>;
  let viem: jest.Mocked<ViemClientPort>;
  let useCase: GetFeedHealthUseCase;

  beforeEach(() => {
    priceFeed = {
      getSpotPrice: jest.fn(),
      getUsdValue: jest.fn(),
      health: jest.fn().mockReturnValue(feed({})),
    };
    dex = {
      getQuote: jest.fn(),
      buildSwapTx: jest.fn(),
      health: jest
        .fn()
        .mockReturnValue(
          feed({ feedId: 'dex:static-mock', source: 'static-mock' }),
        ),
    };
    viem = {
      getNativeBalance: jest.fn(),
      getTokenBalances: jest.fn(),
      lastBlockNumber: jest.fn(),
      health: jest
        .fn()
        .mockReturnValue(feed({ feedId: 'chain:base', source: 'static' })),
      chainHealth: jest.fn(),
    } as unknown as jest.Mocked<ViemClientPort>;
    useCase = new GetFeedHealthUseCase(priceFeed, dex, viem);
  });

  it('reports all feeds and flags nothing when healthy', async () => {
    const report = await useCase.execute();
    expect(report.degraded).toBe(false);
    expect(report.staleFeedIds).toEqual([]);
    expect(report.feeds.map((f) => f.feedId)).toEqual([
      'price:static',
      'dex:static-mock',
      'chain:base',
    ]);
  });

  it('treats unconfigured as degraded — a config TODO is never silent', async () => {
    priceFeed.health.mockReturnValue(
      feed({
        feedId: 'price:coingecko',
        source: 'coingecko',
        status: 'unconfigured',
        lastUpdateAt: null,
        priceAgeSec: null,
      }),
    );
    const report = await useCase.execute();
    expect(report.degraded).toBe(true);
    expect(report.staleFeedIds).toEqual(['price:coingecko']);
  });

  it('flags degradation when the price feed is stale', async () => {
    priceFeed.health.mockReturnValue(
      feed({ status: 'stale', priceAgeSec: 90 }),
    );
    const report = await useCase.execute();
    expect(report.degraded).toBe(true);
    expect(report.staleFeedIds).toEqual(['price:static']);
  });

  it('flags degradation when the aggregator is down', async () => {
    dex.health.mockReturnValue(
      feed({
        feedId: 'dex:static-mock',
        status: 'down',
        lastUpdateAt: null,
        priceAgeSec: null,
      }),
    );
    const report = await useCase.execute();
    expect(report.degraded).toBe(true);
    expect(report.staleFeedIds).toEqual(['dex:static-mock']);
  });
});
