import { Injectable } from '@nestjs/common';
import { ok, type ApiEnvelope, type HealthStatus } from '@kryptr/shared-types';

const startedAt = Date.now();

@Injectable()
export class AppService {
  getData(): { message: string } {
    return { message: 'Hello API' };
  }

  health(): ApiEnvelope<HealthStatus> {
    return ok({
      service: '@kryptr/api',
      status: 'healthy',
      version: process.env['APP_VERSION'] ?? '0.0.1',
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    });
  }
}
