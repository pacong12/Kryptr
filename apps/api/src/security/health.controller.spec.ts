import { Test, type TestingModule } from '@nestjs/testing';
import type { FeedHealth } from '@kryptr/shared-types';
import { HealthController } from './health.controller';
import { GetFeedHealthUseCase } from './application/get-feed-health.usecase';

const PRICE_FEED: FeedHealth = {
  feedId: 'price:static',
  source: 'static',
  status: 'healthy',
  lastUpdateAt: '2026-05-01T00:00:00.000Z',
  priceAgeSec: 5,
};

const DEX_FEED: FeedHealth = {
  feedId: 'dex:static-mock',
  source: 'static-mock',
  status: 'healthy',
  lastUpdateAt: '2026-05-01T00:00:00.000Z',
  priceAgeSec: 0,
};

describe('HealthController (envelope shape)', () => {
  let module: TestingModule;
  let controller: HealthController;
  let getFeedHealth: { execute: jest.Mock };

  beforeAll(async () => {
    getFeedHealth = {
      execute: jest.fn().mockResolvedValue({
        feeds: [PRICE_FEED, DEX_FEED],
        degraded: false,
        staleFeedIds: [],
      }),
    };
    module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: GetFeedHealthUseCase, useValue: getFeedHealth }],
    }).compile();
    controller = module.get(HealthController);
  });

  afterAll(async () => {
    await module.close();
  });

  it('returns ok() with all feeds when healthy', async () => {
    await expect(controller.feeds()).resolves.toEqual({
      ok: true,
      data: [PRICE_FEED, DEX_FEED],
      error: null,
    });
  });

  it('returns a degraded err() envelope when any feed is stale', async () => {
    getFeedHealth.execute.mockResolvedValue({
      feeds: [{ ...PRICE_FEED, status: 'stale' }, DEX_FEED],
      degraded: true,
      staleFeedIds: ['price:static'],
    });
    const envelope = await controller.feeds();
    expect(envelope.ok).toBe(false);
    expect(envelope.data).toBeNull();
    expect(envelope.error).toMatchObject({
      code: 'feeds_degraded',
      message: expect.stringContaining('price:static'),
    });
  });
});
