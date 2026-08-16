import type { WorkerHealth } from '@kryptr/shared-types';
import type { JobQueuePort } from '../domain/job-queue.port';

/**
 * Dev/in-memory dispatch: enqueue hands the execution straight to the
 * dispatcher (the module wires ExecuteOrderSlotUseCase in after
 * compile). Deterministic, no broker — exactly-once is still enforced
 * by the claim store, never by this transport.
 */
export class InMemoryJobQueue implements JobQueuePort {
  private paused = false;
  private dispatcher: ((input: {
    orderId: string;
    slotKey: string;
  }) => Promise<unknown>) | null = null;
  private readonly pending: Array<{ orderId: string; slotKey: string }> = [];
  private readonly inflight = new Set<Promise<unknown>>();

  setDispatcher(
    dispatcher: (input: { orderId: string; slotKey: string }) => Promise<unknown>,
  ): void {
    this.dispatcher = dispatcher;
    const drained = this.pending.splice(0);
    for (const item of drained) {
      this.dispatch(item);
    }
  }

  private dispatch(item: { orderId: string; slotKey: string }): void {
    if (!this.dispatcher) {
      return;
    }
    const task = this.dispatcher(item).catch(() => undefined);
    this.inflight.add(task);
    void task.finally(() => this.inflight.delete(task));
  }

  /** Await every in-flight dispatch (tests + clean shutdown). */
  async drain(): Promise<void> {
    await Promise.all([...this.inflight]);
  }

  async enqueueExecution(
    orderId: string,
    slotKey: string,
  ): Promise<{ jobId: string; deduplicated: boolean }> {
    const jobId = `${orderId}.${slotKey.replace(/:/g, '.')}`;
    if (this.paused || !this.dispatcher) {
      this.pending.push({ orderId, slotKey });
      return { jobId, deduplicated: false };
    }
    this.dispatch({ orderId, slotKey });
    return { jobId, deduplicated: false };
  }

  async pauseExecutions(): Promise<void> {
    this.paused = true;
  }

  async resumeExecutions(): Promise<void> {
    this.paused = false;
    const drained = this.pending.splice(0);
    for (const item of drained) {
      this.dispatch(item);
    }
  }

  async health(nowIso: string): Promise<WorkerHealth> {
    return { component: 'order-worker', ok: true, checkedAt: nowIso };
  }

  /** Test observability. */
  pendingCount(): number {
    return this.pending.length;
  }
}
