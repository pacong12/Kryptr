import { Module } from '@nestjs/common';
import { LaunchpadController } from './launchpad.controller';
import { VERIFICATION_STORE } from './domain/verification-store.port';
import { LAUNCH_RECORD_STORE } from './domain/launch-record-store.port';
import { InMemoryVerificationStore } from './infrastructure/in-memory-verification-store';
import { PostgresVerificationArtifactStore } from './infrastructure/postgres-verification-store';
import { InMemoryLaunchRecordStore } from './infrastructure/in-memory-launch-record-store';
import { PostgresDeployRecordStore } from './infrastructure/postgres-deploy-record-store';
import { RATE_LIMIT_PROVIDER } from './infrastructure/in-memory-fixed-window.rate-limit';
import { isPostgresPersistence } from '../persistence/prisma-client';

/**
 * Launchpad composition root (wave-5 deploy-gate branch). Exports the
 * canonical verification-artifact store so the security gate can run
 * its server-side consent-chip parity check; the read endpoint serves
 * the same artifacts to the frontoffice. Store boots EMPTY — seeding
 * arrives with the T21 battery (factory era).
 *
 * Wave-6 S1: LAUNCH_RECORD_STORE is the deploy-record home (ceremony
 * publish → readback lifecycle); VERIFICATION_STORE gains a Postgres
 * backing under PERSISTENCE_MODE=postgres (git artifacts stay canonical).
 */
@Module({
  controllers: [LaunchpadController],
  providers: [
    {
      provide: VERIFICATION_STORE,
      useFactory: () =>
        isPostgresPersistence()
          ? new PostgresVerificationArtifactStore()
          : new InMemoryVerificationStore(),
    },
    {
      provide: LAUNCH_RECORD_STORE,
      useFactory: () =>
        isPostgresPersistence()
          ? new PostgresDeployRecordStore()
          : new InMemoryLaunchRecordStore(),
    },
    RATE_LIMIT_PROVIDER,
  ],
  exports: [VERIFICATION_STORE, LAUNCH_RECORD_STORE],
})
export class LaunchpadModule {}
