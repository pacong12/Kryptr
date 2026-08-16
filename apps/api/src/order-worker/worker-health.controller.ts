import { Controller, Get } from '@nestjs/common';
import { ok, type ApiEnvelope, type WorkerHealth } from '@kryptr/shared-types';
import { GetWorkerHealthUseCase } from './application/get-worker-health.usecase';

/** GET /health/worker — consumed by the backoffice worker-health panel. */
@Controller('health')
export class WorkerHealthController {
  constructor(private readonly getWorkerHealth: GetWorkerHealthUseCase) {}

  @Get('worker')
  async worker(): Promise<ApiEnvelope<WorkerHealth>> {
    return ok(await this.getWorkerHealth.execute());
  }
}
