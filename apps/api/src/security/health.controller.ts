import { Controller, Get, Inject } from '@nestjs/common';
import {
  err,
  ok,
  type ApiEnvelope,
  type ChainReaderHealth,
  type FeedHealth,
} from '@kryptr/shared-types';
import { GetFeedHealthUseCase } from './application/get-feed-health.usecase';
import { VIEM_CLIENT, type ViemClientPort } from '../chain/viem-client.port';

/**
 * Feed freshness for the backoffice (GET /health/feeds) and chain
 * reachability (GET /health/chains). When any feed is stale, down or
 * unconfigured the feeds envelope itself degrades (ok:false, code
 * 'feeds_degraded') — degradation is never silent. Chain health never
 * exposes raw RPC URLs (they may embed credentials).
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly getFeedHealth: GetFeedHealthUseCase,
    @Inject(VIEM_CLIENT) private readonly viem: ViemClientPort,
  ) {}

  @Get('feeds')
  async feeds(): Promise<ApiEnvelope<FeedHealth[]>> {
    const report = await this.getFeedHealth.execute();
    if (report.degraded) {
      return err({
        code: 'feeds_degraded',
        message: `degraded feeds: ${report.staleFeedIds.join(', ')}`,
        agentHint:
          'Price valuations fail closed (needs_human_approval) until feeds recover. Retry later.',
      });
    }
    return ok(report.feeds);
  }

  @Get('chains')
  async chains(): Promise<ApiEnvelope<ChainReaderHealth[]>> {
    return ok([await this.viem.chainHealth()]);
  }
}
