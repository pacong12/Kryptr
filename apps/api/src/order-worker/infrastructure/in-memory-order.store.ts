import type { Order, OrderStatus } from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import type { OrderStore } from '../domain/order-store.port';

const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'filled',
  'partially_filled',
  'cancelled',
  'expired',
  'failed',
  'rejected',
]);

/**
 * In-memory OrderStore — the worker's source of truth in dev/test.
 * Refuses any status write once an order is terminal (worker must never
 * touch terminal orders). Replaced by Postgres in the persistence task.
 */
export class InMemoryOrderStore implements OrderStore {
  private readonly orders = new Map<string, Order>();

  async save(order: Order): Promise<void> {
    this.orders.set(order.id, { ...order });
  }

  async findById(id: string): Promise<Order | null> {
    const order = this.orders.get(id);
    return order ? { ...order } : null;
  }

  async findOpen(): Promise<Order[]> {
    return [...this.orders.values()]
      .filter((order) => order.status === 'open')
      .map((order) => ({ ...order }));
  }

  async findLive(): Promise<Order[]> {
    return [...this.orders.values()]
      .filter((order) => order.status === 'open' || order.status === 'paused')
      .map((order) => ({ ...order }));
  }

  async findAll(): Promise<Order[]> {
    return [...this.orders.values()].map((order) => ({ ...order }));
  }

  async setStatus(id: string, status: OrderStatus, at: string): Promise<Order> {
    const order = this.orders.get(id);
    if (!order) {
      throw new DomainError('order_not_found', `order "${id}" not found`, 404);
    }
    if (TERMINAL_STATUSES.has(order.status)) {
      throw new DomainError(
        'order_not_live',
        `order "${id}" is terminal ("${order.status}") and can never change status again`,
        409,
      );
    }
    const updated: Order = { ...order, status };
    this.orders.set(id, updated);
    void at; // timestamp accepted for interface parity/audit hooks
    return { ...updated };
  }
}
