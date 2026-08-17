import type { SignRequest, SignRequestStatus } from '@kryptr/shared-types';
import type { SignRequestStore } from '../domain/sign-request-store.port';
import { getPrismaClient } from '../../persistence/prisma-client';
import type { PrismaClient } from '../../generated/prisma/client';

/**
 * Postgres-backed sign requests (wave-6 S1 §3.2/§5.3). createIfAbsent IS
 * the cross-replica decision-binding guard, expressed exactly as the
 * design's SQL:
 *
 *   INSERT ... ON CONFLICT (intent_id) DO NOTHING RETURNING *;
 *
 * The losing replica receives zero rows and must stop — no intent can
 * ever be signed twice across replicas.
 */
export class PostgresSignRequestStore implements SignRequestStore {
  constructor(private readonly db: PrismaClient = getPrismaClient()) {}

  async createIfAbsent(request: SignRequest): Promise<SignRequest | null> {
    const rows = await this.db.$queryRaw<Array<RawSignRequestRow>>`
      INSERT INTO sign_requests (id, intent_id, status, unsigned_tx, digest, note, created_at)
      VALUES (
        ${request.id},
        ${request.intentId},
        ${request.status},
        ${JSON.stringify(request.unsignedTx)}::jsonb,
        ${request.digest},
        ${request.note},
        ${new Date(request.createdAt)}
      )
      ON CONFLICT (intent_id) DO NOTHING
      RETURNING *
    `;
    return rows.length === 1 ? fromRawRow(rows[0]) : null;
  }

  async findById(id: string): Promise<SignRequest | null> {
    const row = await this.db.signRequest.findUnique({ where: { id } });
    return row ? fromPrismaRow(row) : null;
  }

  async findByIntentId(intentId: string): Promise<SignRequest | null> {
    const row = await this.db.signRequest.findUnique({
      where: { intentId },
    });
    return row ? fromPrismaRow(row) : null;
  }

  async markStatus(
    id: string,
    status: SignRequestStatus,
  ): Promise<SignRequest | null> {
    const updated = await this.db.signRequest.updateMany({
      where: { id },
      data: { status },
    });
    if (updated.count === 0) {
      return null;
    }
    return this.findById(id);
  }
}

interface RawSignRequestRow {
  id: string;
  intent_id: string;
  status: string;
  unsigned_tx: unknown;
  digest: string | null;
  note: string | null;
  created_at: Date;
}

/** Raw SQL rows come back snake_case (RETURNING *). */
function fromRawRow(row: RawSignRequestRow): SignRequest {
  return {
    id: row.id,
    intentId: row.intent_id,
    status: row.status as SignRequestStatus,
    unsignedTx: row.unsigned_tx as SignRequest['unsignedTx'],
    digest: (row.digest ?? null) as SignRequest['digest'],
    note: row.note ?? '',
    createdAt: row.created_at.toISOString(),
  };
}

/** Prisma client rows come back camelCase. */
function fromPrismaRow(row: {
  id: string;
  intentId: string;
  status: string;
  unsignedTx: unknown;
  digest: string | null;
  note: string | null;
  createdAt: Date;
}): SignRequest {
  return {
    id: row.id,
    intentId: row.intentId,
    status: row.status as SignRequestStatus,
    unsignedTx: row.unsignedTx as SignRequest['unsignedTx'],
    digest: (row.digest ?? null) as SignRequest['digest'],
    note: row.note ?? '',
    createdAt: row.createdAt.toISOString(),
  };
}
