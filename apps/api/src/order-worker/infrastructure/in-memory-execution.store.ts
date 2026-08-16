import type { OrderExecution } from '@kryptr/shared-types';
import type { ExecutionStore } from '../domain/execution-store.port';

/**
 * In-memory claim store — exactly-once per (orderId, slotKey). The Map
 * set-if-absent is the atomic primitive; Postgres replaces it with a
 * unique constraint + INSERT ... ON CONFLICT DO NOTHING.
 */
/** Non-terminal statuses that a crashed attempt may be resumed from. */
const RESUMABLE_STATUSES: ReadonlySet<OrderExecution['status']> = new Set([
  'claimed',
  'quoted',
]);

export class InMemoryExecutionStore implements ExecutionStore {
  private readonly executions = new Map<string, OrderExecution>();

  async claim(
    orderId: string,
    slotKey: string,
    at: string,
  ): Promise<OrderExecution | null> {
    const id = `${orderId}:${slotKey}`;
    if (this.executions.has(id)) {
      return null;
    }
    const execution: OrderExecution = {
      id,
      orderId,
      slotKey,
      intentId: null,
      status: 'claimed',
      claimedAt: at,
      finishedAt: null,
    };
    this.executions.set(id, execution);
    return { ...execution };
  }

  async reclaim(id: string, at: string): Promise<OrderExecution | null> {
    const execution = this.executions.get(id);
    // Compare-and-set: only NON-TERMINAL records are resumable. The
    // single-threaded check+set is the in-memory atomic primitive;
    // Postgres replaces it with UPDATE ... WHERE status IN (...)
    // RETURNING *.
    if (!execution || !RESUMABLE_STATUSES.has(execution.status)) {
      return null;
    }
    const reclaimed: OrderExecution = { ...execution, status: 'claimed' };
    this.executions.set(id, reclaimed);
    void at; // lease timestamp accepted for interface parity
    return { ...reclaimed };
  }

  async findById(id: string): Promise<OrderExecution | null> {
    const execution = this.executions.get(id);
    return execution ? { ...execution } : null;
  }

  async findByOrderId(orderId: string): Promise<OrderExecution[]> {
    return [...this.executions.values()]
      .filter((execution) => execution.orderId === orderId)
      .map((execution) => ({ ...execution }));
  }

  async update(
    id: string,
    patch: Partial<
      Pick<OrderExecution, 'status' | 'intentId' | 'finishedAt' | 'detail'>
    >,
  ): Promise<OrderExecution> {
    const execution = this.executions.get(id);
    if (!execution) {
      throw new Error(`execution "${id}" not found`);
    }
    const updated = { ...execution, ...patch };
    this.executions.set(id, updated);
    return { ...updated };
  }
}
