import {
  computed,
  onScopeDispose,
  ref,
  toValue,
  type MaybeRefOrGetter,
} from 'vue';
import type { ApiError, Order, WorkerHealth } from '@kryptr/shared-types';
import { DEFAULT_ORDERS_SOURCE, type OrdersSource } from '@/lib/orders';

/** Phases of the order-list lifecycle; the composable owns the machine. */
export type OrdersState = 'loading' | 'ready' | 'error';

/**
 * Owns the wallet's order list + worker health.
 *
 * Orders are long-lived, value-moving automation, so there is deliberately
 * NO fixture fallback: a failed list fetch surfaces as the `error` state and
 * the UI fails closed (wave-3 ruling). Worker health degrades independently
 * — a down worker renders the degradation banner while loaded orders stay
 * visible with a staleness indicator. Manual refresh only (no polling).
 */
export function useOrders(
  walletId: MaybeRefOrGetter<string>,
  source: OrdersSource = DEFAULT_ORDERS_SOURCE,
) {
  const state = ref<OrdersState>('loading');
  const orders = ref<Order[]>([]);
  const error = ref<ApiError | null>(null);
  const workerHealth = ref<WorkerHealth | null>(null);
  let requestSeq = 0;

  /** True once a health card reports `ok: false` (worker down). */
  const workerDown = computed(
    () => workerHealth.value !== null && !workerHealth.value.ok,
  );

  /** Load orders + worker health; superseded refreshes are ignored. */
  async function refresh(): Promise<void> {
    const seq = ++requestSeq;
    state.value = 'loading';
    error.value = null;
    const [ordersResult, healthResult] = await Promise.all([
      source.list(toValue(walletId)),
      source.health(),
    ]);
    if (seq !== requestSeq) return;
    // Health degrades independently: keep the last card when the health
    // endpoint itself is unreachable (envelope error) rather than guessing.
    if (healthResult.ok && healthResult.data) {
      workerHealth.value = healthResult.data;
    }
    if (ordersResult.ok && ordersResult.data) {
      orders.value = ordersResult.data;
      state.value = 'ready';
    } else {
      orders.value = [];
      state.value = 'error';
      error.value = ordersResult.error ?? {
        code: 'unknown',
        message: 'Unable to load orders.',
      };
    }
  }

  /** Invalidate in-flight refreshes when the owning scope tears down. */
  onScopeDispose(() => {
    requestSeq += 1;
  });

  return { state, orders, error, workerHealth, workerDown, refresh };
}
