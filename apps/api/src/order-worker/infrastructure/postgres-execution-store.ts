import type { OrderExecution } from '@kryptr/shared-types';
import type { ExecutionStore } from '../domain/execution-store.port';
import { getPrismaClient } from '../../persistence/prisma-client';
import type { PrismaClient } from '../../generated/prisma/client';
import { DomainError } from '../../common/domain-error';

export const RESUMABLE_STATUSES: ReadonlySet<string> = new Set([
  'claimed',
  'quoted',
]);

/**
 * Postgres-backed Execution store (Wave-6 S1 persistence fase 2).
 * Atomic claim uses UNIQUE (order_id, slot_key) constraint.
 * Atomic reclaim uses conditional UPDATE ... WHERE status IN ('claimed', 'quoted').
 */
export class PostgresExecutionStore implements ExecutionStore {
  constructor(private readonly db: PrismaClient = getPrismaClient()) {}

  async claim(
    orderId: string,
    slotKey: string,
    at: string,
  ): Promise<OrderExecution | null> {
    const id = `${orderId}:${slotKey}`;
    const rows = await this.db.$queryRaw<
      Array<{
        id: string;
        order_id: string;
        slot_key: string;
        status: string;
        intent_id: string | null;
        claimed_at: Date;
        finished_at: Date | null;
        detail: string | null;
      }>
    >`
      INSERT INTO order_executions (id, order_id, slot_key, status, claimed_at)
      VALUES (${id}, ${orderId}, ${slotKey}, 'claimed', ${at}::timestamptz)
      ON CONFLICT (order_id, slot_key) DO NOTHING
      RETURNING id, order_id, slot_key, status, intent_id, claimed_at, finished_at, detail;
    `;

    if (rows.length === 0) {
      return null;
    }

    return this.mapRow(rows[0]);
  }

  async reclaim(id: string, at: string): Promise<OrderExecution | null> {
    const rows = await this.db.$queryRaw<
      Array<{
        id: string;
        order_id: string;
        slot_key: string;
        status: string;
        intent_id: string | null;
        claimed_at: Date;
        finished_at: Date | null;
        detail: string | null;
      }>
    >`
      UPDATE order_executions
      SET status = 'claimed', claimed_at = ${at}::timestamptz
      WHERE id = ${id} AND status IN ('claimed', 'quoted')
      RETURNING id, order_id, slot_key, status, intent_id, claimed_at, finished_at, detail;
    `;

    if (rows.length === 0) {
      return null;
    }

    return this.mapRow(rows[0]);
  }

  async findById(id: string): Promise<OrderExecution | null> {
    const row = await this.db.orderExecution.findUnique({
      where: { id },
    });
    if (!row) {
      return null;
    }
    return this.mapEntity(row);
  }

  async findByOrderId(orderId: string): Promise<OrderExecution[]> {
    const rows = await this.db.orderExecution.findMany({
      where: { orderId },
      orderBy: { claimedAt: 'asc' },
    });
    return rows.map((r) => this.mapEntity(r));
  }

  async update(
    id: string,
    patch: Partial<
      Pick<OrderExecution, 'status' | 'intentId' | 'finishedAt' | 'detail'>
    >,
  ): Promise<OrderExecution> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new DomainError('execution_not_found', `Execution ${id} not found`, 404);
    }

    const updated = await this.db.orderExecution.update({
      where: { id },
      data: {
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.intentId !== undefined && { intentId: patch.intentId }),
        ...(patch.finishedAt !== undefined && {
          finishedAt: patch.finishedAt ? new Date(patch.finishedAt) : null,
        }),
        ...(patch.detail !== undefined && { detail: patch.detail }),
      },
    });

    return this.mapEntity(updated);
  }

  private mapRow(row: {
    id: string;
    order_id: string;
    slot_key: string;
    status: string;
    intent_id: string | null;
    claimed_at: Date;
    finished_at: Date | null;
    detail: string | null;
  }): OrderExecution {
    return {
      id: row.id,
      orderId: row.order_id,
      slotKey: row.slot_key,
      status: row.status as OrderExecution['status'],
      claimedAt: row.claimed_at.toISOString(),
      ...(row.intent_id != null && { intentId: row.intent_id }),
      ...(row.finished_at != null && { finishedAt: row.finished_at.toISOString() }),
      ...(row.detail != null && { detail: row.detail }),
    };
  }

  private mapEntity(row: {
    id: string;
    orderId: string;
    slotKey: string;
    status: string;
    intentId: string | null;
    claimedAt: Date;
    finishedAt: Date | null;
    detail: string | null;
  }): OrderExecution {
    return {
      id: row.id,
      orderId: row.orderId,
      slotKey: row.slotKey,
      status: row.status as OrderExecution['status'],
      claimedAt: row.claimedAt.toISOString(),
      ...(row.intentId != null && { intentId: row.intentId }),
      ...(row.finishedAt != null && { finishedAt: row.finishedAt.toISOString() }),
      ...(row.detail != null && { detail: row.detail }),
    };
  }
}
