import type { Order, OrderStatus } from '@kryptr/shared-types';

/**
 * Order persistence (wave 4). The OrderStore is the SOURCE OF TRUTH for
 * automation — Redis/BullMQ is transport only, and a worker restart
 * reconciles from here. Shapes are Postgres-ready.
 */

export const ORDER_STORE = 'order-worker.order-store';

export interface OrderStore {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
  /** Orders eligible for scheduling (status 'open'), any chain. */
  findOpen(): Promise<Order[]>;
  /** All orders regardless of status (backoffice listing). */
  findAll(): Promise<Order[]>;
  /**
   * Live orders for the kill-switch cancel_active fan-out (freeze §3):
   * BOTH 'open' AND 'paused'. findOpen() stays scheduler-scoped.
   */
  findLive(): Promise<Order[]>;
  /**
   * Transition an order's status. Implementations MUST refuse writes to
   * terminal statuses (filled/cancelled/expired/failed) — the worker
   * never touches a terminal order.
   */
  setStatus(id: string, status: OrderStatus, at: string): Promise<Order>;
}
