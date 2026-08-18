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
import { FilesystemAbiConsumer } from './infrastructure/filesystem-abi-consumer';
import { ABICONSUMER_TOKEN, type AbiConsumerPort } from './domain/abi-consumer.port';
<<<<<<< HEAD
=======
import { TokenFactoryService } from './application/token-factory.service';
>>>>>>> origin/feat/core-sprint2-order-automation

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
 * 
 * Wave-6 S2: Contract ABI Consumer - loads TokenFactory.json for contract
 * interface validation and deployment preparation.
 */
@Module({
  controllers: [LaunchpadController],
  providers: [
    // Artifact stores
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
    
<<<<<<< HEAD
    // ABI Consumer Integration (Task 1.3 Sprint 2)
    FilesystemAbiConsumer,
  ],
  exports: [VERIFICATION_STORE, LAUNCH_RECORD_STORE, ABICONSUMER_TOKEN],
=======
    // ABI Consumer Integration (Sprint 2)
    FilesystemAbiConsumer,
    
    // TokenFactory Integration Service (Sprint 3)
    TokenFactoryService,
  ],
  exports: [VERIFICATION_STORE, LAUNCH_RECORD_STORE, ABICONSUMER_TOKEN, TokenFactoryService],
>>>>>>> origin/feat/core-sprint2-order-automation
})
export class LaunchpadModule {}
