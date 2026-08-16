import { Module } from '@nestjs/common';
import { LaunchpadController } from './launchpad.controller';
import { VERIFICATION_STORE } from './domain/verification-store.port';
import { InMemoryVerificationStore } from './infrastructure/in-memory-verification-store';
import { RATE_LIMIT_PROVIDER } from './infrastructure/in-memory-fixed-window.rate-limit';

/**
 * Launchpad composition root (wave-5 deploy-gate branch). Exports the
 * canonical verification-artifact store so the security gate can run
 * its server-side consent-chip parity check; the read endpoint serves
 * the same artifacts to the frontoffice. Store boots EMPTY — seeding
 * arrives with the T21 battery (factory era).
 */
@Module({
  controllers: [LaunchpadController],
  providers: [
    { provide: VERIFICATION_STORE, useClass: InMemoryVerificationStore },
    RATE_LIMIT_PROVIDER,
  ],
  exports: [VERIFICATION_STORE],
})
export class LaunchpadModule {}
