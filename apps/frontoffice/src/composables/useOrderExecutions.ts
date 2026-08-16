import { onScopeDispose, ref } from 'vue';
import type { ApiError, OrderExecution } from '@kryptr/shared-types';
import { DEFAULT_ORDERS_SOURCE, type OrdersSource } from '@/lib/orders';

/** Phases of the per-order executions load; the composable owns the machine. */
export type OrderExecutionsState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Owns the on-demand executions ledger for ONE expanded order row.
 * User-triggered only (no polling); superseded loads are ignored, so a fast
 * expand/collapse never renders a stale order's executions. Fails closed:
 * an error envelope lands in `error`, never a fabricated empty list.
 */
export function useOrderExecutions(
  source: OrdersSource = DEFAULT_ORDERS_SOURCE,
) {
  const state = ref<OrderExecutionsState>('idle');
  const orderId = ref<string | null>(null);
  const executions = ref<OrderExecution[]>([]);
  const error = ref<ApiError | null>(null);
  let requestSeq = 0;

  /** Load the executions of one order into the panel. */
  async function load(id: string): Promise<void> {
    const seq = ++requestSeq;
    orderId.value = id;
    state.value = 'loading';
    error.value = null;
    executions.value = [];
    const result = await source.executions(id);
    if (seq !== requestSeq) return;
    if (result.ok && result.data) {
      executions.value = result.data;
      state.value = 'ready';
    } else {
      state.value = 'error';
      error.value = result.error ?? {
        code: 'unknown',
        message: 'Unable to load executions.',
      };
    }
  }

  /** Collapse the panel and drop the loaded ledger. */
  function reset(): void {
    requestSeq += 1;
    state.value = 'idle';
    orderId.value = null;
    executions.value = [];
    error.value = null;
  }

  onScopeDispose(() => {
    requestSeq += 1;
  });

  return { state, orderId, executions, error, load, reset };
}
