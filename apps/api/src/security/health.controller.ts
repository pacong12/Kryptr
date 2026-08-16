import { Controller, Get } from '@nestjs/common';
import {
  err,
  ok,
  type ApiEnvelope,
  type FeedHealth,
} from '@kryptr/shared-types';
import { GetFeedHealthUseCase } from './application/get-feed-health.usecase';

/**
 * Feed freshness for the backoffice (GET /health/feeds). When any feed
 * is stale or down the envelope itself degrades (ok:false, code
 * 'feeds_degraded') — staleness is never silent.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly getFeedHealth: GetFeedHealthUseCase) {}

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
}
