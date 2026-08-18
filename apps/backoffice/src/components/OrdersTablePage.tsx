'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';

import { useOrdersPolling } from '@/composables/useOrdersPolling';
import {
  OrderSideBadge,
  OrderStatusBadge,
  OrderTypeBadge,
} from '@/components/order-badges';
import { formatDateTime, shortenHex } from '@/lib/format';
import type { Order } from '@kryptr/shared-types';

function assetLabel(asset: `0x${string}` | null): string {
  return asset === null ? 'native' : shortenHex(asset);
}

/**
 * W7-M6: Live orders table component with auto-refresh animation for new entries.
 */
function OrdersTableLive({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        No orders found. Polling for updates...
      </p>
    );
  }

  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-border bg-muted/50">
        <tr>
          <th className="px-4 py-3 font-medium">Order</th>
          <th className="px-4 py-3 font-medium">Type</th>
          <th className="px-4 py-3 font-medium">Side</th>
          <th className="px-4 py-3 font-medium">Asset</th>
          <th className="px-4 py-3 font-medium">Amount</th>
          <th className="px-4 py-3 font-medium">Limit / Interval</th>
          <th className="px-4 py-3 font-medium">Created</th>
          <th className="px-4 py-3 font-medium">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {orders.map((order, index) => (
          <tr
            key={order.id}
            className={`transition-all duration-300 ease-in-out ${index === 0 ? 'animate-pulse bg-green-500/5' : ''}`}
          >
            <td className="px-4 py-2 font-medium">
              <span className="font-mono">{order.id}</span>
            </td>
            <td className="px-4 py-2">
              <OrderTypeBadge type={order.type} />
            </td>
            <td className="px-4 py-2">
              <OrderSideBadge side={order.side} />
            </td>
            <td className="px-4 py-2 font-mono text-muted-foreground">
              {assetLabel(order.baseAsset)} / {assetLabel(order.quoteAsset)}
            </td>
            <td className="px-4 py-2 font-mono text-muted-foreground">
              {order.amount}
            </td>
            <td className="px-4 py-2 text-muted-foreground">
              {order.limitPrice ?? '—'} · {order.interval ?? 'once'}
            </td>
            <td className="px-4 py-2 text-muted-foreground">
              {formatDateTime(order.createdAt)}
            </td>
            <td className="px-4 py-2">
              <OrderStatusBadge status={order.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * W7-M6: Main orders page component integrating live polling composable.
 * Auto-refreshes every 5 seconds with loading indicators and status colors.
 */
export function OrdersTablePage() {
  const { orders, loading, lastFetchedAt } = useOrdersPolling({
    intervalMs: 5000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-4">
          <span>Orders</span>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">
              Last fetch: {lastFetchedAt?.toLocaleTimeString()}
            </span>
            <span
              className={`h-2 w-2 rounded-full ${loading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}
            />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <OrdersTableLive orders={orders} />
      </CardContent>
    </Card>
  );
}
