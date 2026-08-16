import { computed, onScopeDispose, ref } from 'vue';
import type { ApiError, WorkerHealth } from '@kryptr/shared-types';
import { DEFAULT_ORDERS_SOURCE, type OrdersSource } from '@/lib/orders';

/** Phases of the health check; the composable owns the machine. */
export type WorkerHealthState = 'loading' | 'ready' | 'error';

/**
 * Owns ONLY the order-worker health signal for surfaces that display it
 * without listing orders (e.g. the landing page status chips). The
 * list/create flows live in `useOrders`.
 *
 * Fails closed like everything else in the order stack: an unreachable
 * health endpoint reports "unavailable" — never guessed healthy.
 */
export function useWorkerHealth(source: OrdersSource = DEFAULT_ORDERS_SOURCE) {
  const state = ref<WorkerHealthState>('loading');
  const workerHealth = ref<WorkerHealth | null>(null);
  const error = ref<ApiError | null>(null);
  let requestSeq = 0;

  /** True once a health card reports `ok: false` (worker down). */
  const workerDown = computed(
    () => workerHealth.value !== null && !workerHealth.value.ok,
  );

  /** Fetch the health card; superseded checks are ignored on resolution. */
  async function refresh(): Promise<void> {
    const seq = ++requestSeq;
    state.value = 'loading';
    error.value = null;
    const result = await source.health();
    if (seq !== requestSeq) return;
    if (result.ok && result.data) {
      workerHealth.value = result.data;
      state.value = 'ready';
    } else {
      workerHealth.value = null;
      state.value = 'error';
      error.value = result.error ?? {
        code: 'unknown',
        message: 'Unable to check the order worker.',
      };
    }
  }

  onScopeDispose(() => {
    requestSeq += 1;
  });

  return { state, workerHealth, workerDown, error, refresh };
}
