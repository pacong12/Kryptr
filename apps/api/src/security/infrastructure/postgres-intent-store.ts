import type { TransactionIntent } from '@kryptr/shared-types';
import type { IntentStore } from '../application/ports';
import { getPrismaClient } from '../../persistence/prisma-client';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';

/**
 * Postgres-backed intent store (wave-6 S1). The full intent is persisted
 * as JSONB (the timeline/preview source of truth) with kind/wallet
 * mirrored as columns for querying. Upsert on the API-originated id keeps
 * re-evaluation idempotent.
 */
export class PostgresIntentStore implements IntentStore {
  constructor(private readonly db: PrismaClient = getPrismaClient()) {}

  async save(intent: TransactionIntent): Promise<void> {
    await this.db.transactionIntent.upsert({
      where: { id: intent.id },
      create: {
        id: intent.id,
        walletId: intent.walletId,
        kind: intent.kind,
        payload: intent as unknown as Prisma.InputJsonValue,
      },
      update: {
        walletId: intent.walletId,
        kind: intent.kind,
        payload: intent as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findById(id: string): Promise<TransactionIntent | null> {
    const row = await this.db.transactionIntent.findUnique({
      where: { id },
    });
    if (!row) {
      return null;
    }
    return row.payload as unknown as TransactionIntent;
  }
}
