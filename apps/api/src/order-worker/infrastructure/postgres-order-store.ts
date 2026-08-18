import type { Order, OrderStatus } from '@kryptr/shared-types';
import type { OrderStore } from '../domain/order-store.port';
import { getPrismaClient } from '../../persistence/prisma-client';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { DomainError } from '../../common/domain-error';

export const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'filled',
  'partially_filled',
  'cancelled',
  'expired',
  'failed',
  'rejected',
]);

/**
 * Postgres-backed Order store (Wave-6 S1 persistence fase 2).
 * Payload is JSONB (source of truth); scalar `status` column mirrors
 * `payload.status` for indexing and conditional SQL updates.
 */
export class PostgresOrderStore implements OrderStore {
  constructor(private readonly db: PrismaClient = getPrismaClient()) {}

  async save(order: Order): Promise<void> {
    await this.db.$executeRaw`
      INSERT INTO orders (id, payload, status, updated_at)
      VALUES (${order.id}, ${JSON.stringify(order)}::jsonb, ${order.status}, NOW())
      ON CONFLICT (id) DO UPDATE
      SET payload = EXCLUDED.payload,
          status = EXCLUDED.status,
          updated_at = NOW();
    `;
  }

  async findById(id: string): Promise<Order | null> {
    const row = await this.db.order.findUnique({
      where: { id },
    });
    if (!row) {
      return null;
    }
    return row.payload as unknown as Order;
  }

  async findOpen(): Promise<Order[]> {
    const rows = await this.db.order.findMany({
      where: { status: 'open' },
    });
    return rows.map((row) => row.payload as unknown as Order);
  }

  async findAll(): Promise<Order[]> {
    const rows = await this.db.order.findMany();
    return rows.map((row) => row.payload as unknown as Order);
  }

  async findLive(): Promise<Order[]> {
    const rows = await this.db.order.findMany({
      where: {
        status: { in: ['open', 'paused'] },
      },
    });
    return rows.map((row) => row.payload as unknown as Order);
  }

  async setStatus(id: string, status: OrderStatus, at: string): Promise<Order> {
    const rows = await this.db.$queryRaw<Array<{ payload: Prisma.JsonValue }>>`
      UPDATE orders
      SET payload = jsonb_set(payload, '{status}', to_jsonb(${status}::text)),
          status = ${status},
          updated_at = ${at}::timestamptz
      WHERE id = ${id}
        AND status NOT IN ('filled','partially_filled','cancelled','expired','failed','rejected')
      RETURNING payload;
    `;

    if (rows.length > 0) {
      return rows[0].payload as unknown as Order;
    }

    const existing = await this.findById(id);
    if (!existing) {
      throw new DomainError('order_not_found', `Order ${id} not found`, 404);
    }
    throw new DomainError(
      'order_not_live',
      `Order ${id} is in terminal status ${existing.status}`,
      409,
    );
  }
}
