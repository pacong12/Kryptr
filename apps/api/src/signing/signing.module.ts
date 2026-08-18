import { Module } from '@nestjs/common';
import { SIGNER } from './domain/signer.port';
import { SIGN_REQUEST_STORE } from './domain/sign-request-store.port';
import { DryRunSigner } from './infrastructure/dry-run.signer';
import { PostgresSigner } from './infrastructure/postgres-signer';
import { InMemorySignRequestStore } from './infrastructure/in-memory-sign-request-store';
import { PostgresSignRequestStore } from './infrastructure/postgres-sign-request-store';
import { isPostgresPersistence } from '../persistence/prisma-client';
import { SigningService } from './application/signing.service';
import { SigningController } from './signing.controller';

/**
 * Composition root for the signing boundary. Wave 3 binds DryRunSigner
 * (hashes unsigned calldata, never returns a signature); a real external
 * signer swaps in here without touching the gate.
 *
 * Wave-6 S1: SIGN_REQUEST_STORE persists sign requests with the
 * cross-replica decision-binding guard (UNIQUE intent_id).
 * Wave-6 S2: SigningService (application layer) + SigningController.
 */
@Module({
  controllers: [SigningController],
  providers: [
    {
      provide: SIGNER,
      useFactory: () =>
        isPostgresPersistence() ? new PostgresSigner() : new DryRunSigner(),
    },
    {
      provide: SIGN_REQUEST_STORE,
      useFactory: () =>
        isPostgresPersistence()
          ? new PostgresSignRequestStore()
          : new InMemorySignRequestStore(),
    },
    SigningService,
  ],
  exports: [SIGNER, SIGN_REQUEST_STORE, SigningService],
})
export class SigningModule {}
