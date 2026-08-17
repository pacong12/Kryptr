import type { VerificationArtifactRef } from '@kryptr/shared-types';
import type { VerificationArtifactStore } from '../domain/verification-store.port';
import { getPrismaClient } from '../../persistence/prisma-client';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';

/**
 * Postgres-backed T21 verification artifacts (wave-6 S1 §3.3): the
 * operational copy so gate + consent-chip lookups survive restarts
 * without file access. Git-committed artifacts stay canonical; seeding
 * remains an explicit ops act (fail-closed boot is unchanged).
 */
export class PostgresVerificationArtifactStore implements VerificationArtifactStore {
  constructor(private readonly db: PrismaClient = getPrismaClient()) {}

  async get(id: string): Promise<VerificationArtifactRef | null> {
    const row = await this.db.verificationArtifact.findUnique({
      where: { verificationId: id },
    });
    if (!row) {
      return null;
    }
    return row.artifact as unknown as VerificationArtifactRef;
  }

  async put(artifact: VerificationArtifactRef): Promise<void> {
    await this.db.verificationArtifact.upsert({
      where: { verificationId: artifact.id },
      create: {
        verificationId: artifact.id,
        artifact: artifact as unknown as Prisma.InputJsonValue,
      },
      update: {
        artifact: artifact as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
