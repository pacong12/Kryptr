import { Module } from '@nestjs/common';
import { SIGNER } from './domain/signer.port';
import { DryRunSigner } from './infrastructure/dry-run.signer';

/**
 * Composition root for the signing boundary. Wave 3 binds DryRunSigner
 * (hashes unsigned calldata, never returns a signature); a real external
 * signer swaps in here without touching the gate.
 */
@Module({
  providers: [{ provide: SIGNER, useClass: DryRunSigner }],
  exports: [SIGNER],
})
export class SigningModule {}
