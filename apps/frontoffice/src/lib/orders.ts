import type { InjectionKey } from 'vue';
import type {
  ApiEnvelope,
  ChainId,
  Order,
  OrderType,
  WorkerHealth,
} from '@kryptr/shared-types';
import { err, ok } from '@kryptr/shared-types';

/**
 * Wave-4 order creation request: the frozen `Order` shape minus the
 * server-assigned fields (`id`, `status`, `createdAt`).
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
 * Data port for the order-worker API. The endpoint contract has not landed
 * on main yet (VaultAPI builds it in wave 4), so frontoffice codes against
 * this port instead of invented URLs. When the endpoints freeze, an
 * apiGet/apiPost-backed source slots in here and nothing above the port
 * (composables, components) changes.
 */
export interface OrdersSource {
  /** Orders of one wallet, newest first. */
  list(walletId: string): Promise<ApiEnvelope<Order[]>>;
  /** Feeds-style worker health card (freeze: `WorkerHealth`). */
  health(): Promise<ApiEnvelope<WorkerHealth>>;
  /** Create an order; the worker validates type, kill switch and policy. */
  create(request: NewOrderRequest): Promise<ApiEnvelope<Order>>;
}

const STUB_MESSAGE =
  'The order-worker API has no endpoint contract in this deployment yet, so order automation is unavailable. Nothing here is simulated.';

/**
 * Fail-closed stub source used until the worker API contract lands.
 *
 * Every call resolves to a typed error envelope — never fabricated orders or
 * health, never a throw — mirroring the wave-3 `aggregator_unconfigured`
 * pattern. One honest exception: `stop`/`twap` creation is rejected with the
 * frozen `order_type_unsupported` code, because the freeze (§1) guarantees
 * the worker rejects those types with exactly that envelope regardless of
 * deployment.
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
  };
}

/** App-wide default source; tests inject custom sources through the composables. */
export const DEFAULT_ORDERS_SOURCE: OrdersSource = createStubOrdersSource();

/**
 * Optional page-level override seam. Tests provide a healthy or specifically
 * failing source; production falls back to the fail-closed stub above.
 */
export const ORDERS_SOURCE_KEY: InjectionKey<OrdersSource> =
  Symbol('ordersSource');
