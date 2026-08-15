/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { ApiEnvelopeExceptionFilter } from './common/api-envelope.exception-filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const config = app.get(ConfigService);
  // Browser apps (frontoffice :4200, backoffice :3000) call this API
  // cross-origin; without CORS they silently fall back to mock data.
  // Configure via CORS_ORIGINS (comma-separated) for non-dev deployments.
  const corsOrigins = (
    config.get<string>('CORS_ORIGINS') ??
    'http://localhost:4200,http://localhost:3000,http://localhost:4300'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApiEnvelopeExceptionFilter());
  const port = config.get('API_PORT') ?? 3333;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
