import type { InjectionKey } from 'vue';
import type {
  ApiEnvelope,
  ChainId,
  Order,
  OrderExecution,
  OrderType,
  WorkerHealth,
} from '@kryptr/shared-types';
import { err, ok } from '@kryptr/shared-types';
import { apiGet, apiPost } from '@/lib/api';

/**
 * Wave-4 order creation request: the frozen `Order` shape minus the
 * server-assigned fields (`id`, `status`, `createdAt`). Matches the
 * worker's `CreateOrderDto` wire shape field-for-field.
 */
export interface NewOrderRequest {
  walletId: string;
  type: OrderType;
  chain: ChainId;
  /** Asset being bought/sold (contract address or null for native). */
  baseAsset: `0x${string}` | null;
  /** Quote asset used for pricing (contract address or null for native). */
  quoteAsset: `0x${string}` | null;
  side: 'buy' | 'sell';
  /** Raw units as string. */
  amount: string;
  /** Limit orders only; null otherwise. */
  limitPrice: string | null;
  /** ISO-8601 interval for dca (e.g. "P1D"); null otherwise. */
  interval: string | null;
}

/** Order types the wave-4 worker implements (freeze §1: limit + dca). */
export const SUPPORTED_ORDER_TYPES = ['limit', 'dca'] as const;

/**
 * Wave-4 support check for an order type. `stop`/`twap` stay in the frozen
 * `OrderType` union for compatibility but are rejected explicitly with
 * `order_type_unsupported` — never silently accepted, never hidden.
 */
export function isSupportedOrderType(type: OrderType): type is 'limit' | 'dca' {
  return (SUPPORTED_ORDER_TYPES as readonly OrderType[]).includes(type);
}

/**
 * Data port for the order-worker API. The wave-4 rewire binds it to the
 * shipped worker endpoints (`GET/POST /orders`, `GET /orders/:id/executions`,
 * `GET /health/worker`); tests inject custom sources through the composables
 * or the `ORDERS_SOURCE_KEY` page seam.
 */
export interface OrdersSource {
  /** Orders of one wallet, newest first. */
  list(walletId: string): Promise<ApiEnvelope<Order[]>>;
  /** Feeds-style worker health card (freeze: `WorkerHealth`). */
  health(): Promise<ApiEnvelope<WorkerHealth>>;
  /** Create an order; the worker validates type, kill switch and policy. */
  create(request: NewOrderRequest): Promise<ApiEnvelope<Order>>;
  /** Claimed executions of one order (the exactly-once ledger entries). */
  executions(orderId: string): Promise<ApiEnvelope<OrderExecution[]>>;
}

/**
 * Real source bound to the shipped worker endpoints (wave-4 rewire).
 *
 * The list endpoint answers for ALL wallets, so wallet scoping happens
 * client-side after a successful fetch — an error envelope passes through
 * untouched and is never converted into an empty list. With the default
 * `AUTOMATION_MODE=disabled` the API answers `worker_unavailable` (503) or a
 * down health card; both degrade honestly in the UI, nothing is faked.
 */
export function createApiOrdersSource(): OrdersSource {
  return {
    list: async (walletId: string) => {
      const result = await apiGet<Order[]>('/orders');
      if (!result.ok || result.data === null) return result;
      return ok(result.data.filter((order) => order.walletId === walletId));
    },
    health: async () => apiGet<WorkerHealth>('/health/worker'),
    create: async (request: NewOrderRequest) =>
      apiPost<Order>('/orders', request),
    executions: async (orderId: string) =>
      apiGet<OrderExecution[]>(`/orders/${orderId}/executions`),
  };
}

/** App-wide default source: the real worker endpoints. */
export const DEFAULT_ORDERS_SOURCE: OrdersSource = createApiOrdersSource();

const STUB_MESSAGE =
  'Order automation is unavailable in this context; nothing here is simulated.';

/**
 * Fail-closed stub source for tests that need the pre-rewire posture: every
 * call resolves to a typed error envelope — never fabricated orders or
 * health, never a throw. One honest exception: `stop`/`twap` creation is
 * rejected with the frozen `order_type_unsupported` code, because the freeze
 * (§1) guarantees the worker rejects those types with exactly that envelope.
 */
export function createStubOrdersSource(
  now: () => string = () => new Date().toISOString(),
): OrdersSource {
  return {
    list: async (_walletId: string) =>
      err<Order[]>({ code: 'worker_unavailable', message: STUB_MESSAGE }),
    health: async () =>
      ok<WorkerHealth>({
        component: 'order-worker',
        ok: false,
        detail: 'worker_unavailable',
        checkedAt: now(),
      }),
    create: async (request: NewOrderRequest) => {
      if (!isSupportedOrderType(request.type)) {
        return err<Order>({
          code: 'order_type_unsupported',
          message: `Order type '${request.type}' is not supported in wave 4; only limit and dca are implemented.`,
        });
      }
      return err<Order>({
        code: 'worker_unavailable',
        message: STUB_MESSAGE,
      });
    },
    executions: async (_orderId: string) =>
      err<OrderExecution[]>({
        code: 'worker_unavailable',
        message: STUB_MESSAGE,
      }),
  };
}

/**
 * Optional page-level override seam. Tests provide a healthy or specifically
 * failing source; production uses the API-bound default above.
 */
export const ORDERS_SOURCE_KEY: InjectionKey<OrdersSource> =
  Symbol('ordersSource');
