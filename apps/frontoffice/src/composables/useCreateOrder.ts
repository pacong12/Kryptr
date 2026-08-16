import { onScopeDispose, ref } from 'vue';
import type { ApiError, Order } from '@kryptr/shared-types';
import { err } from '@kryptr/shared-types';
import {
  DEFAULT_ORDERS_SOURCE,
  isSupportedOrderType,
  type NewOrderRequest,
  type OrdersSource,
} from '@/lib/orders';

/**
 * Owns order creation. Fails closed end-to-end:
 *
 * - `stop`/`twap` are rejected locally with the frozen
 *   `order_type_unsupported` envelope BEFORE touching the source (freeze §1:
 *   explicit rejection, never hidden, never silently accepted);
 * - source errors surface as `error` with the envelope intact — the UI maps
 *   the code to human copy via `workerErrorMeta`, never a stack trace.
 */
export function useCreateOrder(source: OrdersSource = DEFAULT_ORDERS_SOURCE) {
  const submitting = ref(false);
  const error = ref<ApiError | null>(null);
  const created = ref<Order | null>(null);
  let requestSeq = 0;

  /**
   * Submit a new order. Returns true only when the source confirmed
   * creation; every other outcome lands in `error`.
   */
  async function create(request: NewOrderRequest): Promise<boolean> {
    const seq = ++requestSeq;
    submitting.value = true;
    error.value = null;
    created.value = null;
    const result = isSupportedOrderType(request.type)
      ? await source.create(request)
      : err<Order>({
          code: 'order_type_unsupported',
          message: `Order type '${request.type}' is not supported in wave 4; only limit and dca are implemented.`,
        });
    if (seq !== requestSeq) return false;
    submitting.value = false;
    if (result.ok && result.data) {
      created.value = result.data;
      return true;
    }
    error.value = result.error ?? {
      code: 'unknown',
      message: 'Unable to create the order.',
    };
    return false;
  }

  /** Drop the current outcome (e.g. when the form changes). */
  function reset(): void {
    requestSeq += 1;
    submitting.value = false;
    error.value = null;
    created.value = null;
  }

  onScopeDispose(() => {
    requestSeq += 1;
  });

  return { submitting, error, created, create, reset };
}
