import { DomainError } from '../../common/domain-error';
import { getPrismaClient } from '../../persistence/prisma-client';
import {
  DEPLOY_RECORD_TRANSITIONS,
  type DeployRecord,
  type DeployRecordStatus,
  type LaunchRecordStore,
} from '../domain/launch-record-store.port';
import { Prisma, type PrismaClient } from '../../generated/prisma/client';

/**
 * Postgres-backed deploy records (wave-6 S1 §3.1) — the launch-state home
 * joining S2 (ceremony publish), G4 (readback writes), and the backoffice
 * timeline. Lifecycle is append-only forward (S2 §8): transitions are
 * guarded with a status-conditional UPDATE so a backward/skipping move or
 * a concurrent writer fails closed instead of corrupting the trail.
 */
export class PostgresDeployRecordStore implements LaunchRecordStore {
  constructor(private readonly db: PrismaClient = getPrismaClient()) {}

  async publish(
    record: Parameters<LaunchRecordStore['publish']>[0],
  ): Promise<DeployRecord> {
    const row = await this.db.deployRecord.create({
      data: {
        id: record.id,
        stage: record.stage,
        chain: record.chain,
        releaseTag: record.releaseTag,
        commitSha: record.commitSha,
        payloadFile: record.payloadFile,
        calldataKeccak: record.calldataKeccak,
        expectedNonce: record.expectedNonce,
        decodedArgs: toJsonField(record.decodedConstructorArgs),
        frozenConstants: toJsonField(record.frozenConstants),
        status: 'published',
      },
    });
    return fromPrismaRow(row);
  }

  async findById(id: string): Promise<DeployRecord | null> {
    const row = await this.db.deployRecord.findUnique({ where: { id } });
    return row ? fromPrismaRow(row) : null;
  }

  async transition(
    id: string,
    patch: Parameters<LaunchRecordStore['transition']>[1],
  ): Promise<DeployRecord> {
    // Legal predecessors for the requested target, from the frozen
    // forward-lifecycle map.
    const predecessors = (
      Object.keys(DEPLOY_RECORD_TRANSITIONS) as DeployRecordStatus[]
    ).filter((from) => DEPLOY_RECORD_TRANSITIONS[from].includes(patch.status));
    if (predecessors.length === 0) {
      throw new DomainError(
        'invalid_transition',
        `deploy record "${id}": no lifecycle step leads to ${patch.status}`,
      );
    }

    const data: {
      status: string;
      txHash?: string;
      deployedAddress?: string;
      rejectionReason?: string;
      readbackAt?: Date;
    } = { status: patch.status };
    if (patch.txHash !== undefined) {
      data.txHash = patch.txHash;
    }
    if (patch.deployedAddress !== undefined) {
      data.deployedAddress = patch.deployedAddress;
    }
    if (patch.rejectionReason !== undefined) {
      data.rejectionReason = patch.rejectionReason;
    }
    if (
      patch.status === 'readback_passed' ||
      patch.status === 'readback_rejected'
    ) {
      data.readbackAt = new Date();
    }

    const updated = await this.db.deployRecord.updateMany({
      where: { id, status: { in: predecessors } },
      data,
    });
    if (updated.count === 1) {
      const fresh = await this.findById(id);
      if (fresh) {
        return fresh;
      }
    }

    // Fail-closed diagnostics: distinguish unknown id from an illegal
    // transition (a readback REJECT is recorded, never silently retried).
    const existing = await this.findById(id);
    if (!existing) {
      throw new DomainError(
        'invalid_transition',
        `deploy record "${id}" not found`,
        404,
      );
    }
    throw new DomainError(
      'invalid_transition',
      `deploy record "${id}": ${existing.status} -> ${patch.status} is not a forward lifecycle step`,
    );
  }
}

function fromPrismaRow(row: {
  id: string;
  stage: string;
  chain: string;
  releaseTag: string;
  commitSha: string;
  payloadFile: string;
  calldataKeccak: string;
  expectedNonce: number | null;
  decodedArgs: unknown;
  frozenConstants: unknown;
  status: string;
  txHash: string | null;
  deployedAddress: string | null;
  readbackAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DeployRecord {
  return {
    id: row.id,
    stage: row.stage as DeployRecord['stage'],
    chain: row.chain,
    releaseTag: row.releaseTag,
    commitSha: row.commitSha,
    payloadFile: row.payloadFile,
    calldataKeccak: row.calldataKeccak,
    expectedNonce: row.expectedNonce,
    decodedConstructorArgs:
      (row.decodedArgs as Record<string, unknown> | null) ?? null,
    frozenConstants:
      (row.frozenConstants as Record<string, unknown> | null) ?? null,
    status: row.status as DeployRecordStatus,
    txHash: row.txHash,
    deployedAddress: row.deployedAddress,
    readbackAt: row.readbackAt ? row.readbackAt.toISOString() : null,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Nullable JSONB: Prisma needs DbNull (SQL NULL), not a literal null. */
function toJsonField(
  value: Record<string, unknown> | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}
