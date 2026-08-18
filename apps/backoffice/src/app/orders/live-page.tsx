'use client';

import Link from 'next/link';
import { ArrowLeftIcon } from 'lucide-react';
import type { Order } from '@kryptr/shared-types';
import { Button } from '@kryptr/shared-ui/react/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';

import { useOrdersPolling } from '@/composables/useOrdersPolling';
import {
  OrdersActivityFeed,
  type OrderEvent,
} from '@/components/OrdersActivityFeed';
import {
  OrderSideBadge,
  OrderStatusBadge,
  OrderTypeBadge,
} from '@/components/order-badges';
import { formatDateTime, shortenHex } from '@/lib/format';

function assetLabel(asset: `0x${string}` | null): string {
  return asset === null ? 'native' : shortenHex(asset);
}

function OrdersTableLive({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No orders found. Polling for updates...
      </p>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="min-w-full text-left text-sm">
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
                <Link
                  href={`/orders/${order.id}`}
                  className="font-mono underline-offset-4 hover:underline"
                >
                  {order.id}
                </Link>
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
    </div>
  );
}

export function LiveOrdersPage() {
  const { orders, loading, lastFetchedAt, error } = useOrdersPolling({
    intervalMs: 5000,
  });

  // Generate mock activity events from orders
  const activityEvents: OrderEvent[] = orders.slice(0, 10).map((order) => ({
    id: `evt_${order.id}`,
    orderId: order.id,
    timestamp: new Date(order.createdAt),
    type: order.status === 'pending_approval' ? 'created' : 'executed',
    amount: order.amount,
    status: order.status,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeftIcon aria-hidden /> Back
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            Live Orders Monitor
          </h1>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            Auto-refresh every 5s · Last: {lastFetchedAt?.toLocaleTimeString()}
          </span>
          <span
            className={`h-2 w-2 rounded-full ${loading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}
          />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Active Orders
              <span className="text-xs font-normal text-muted-foreground">
                {orders.length} order{orders.length !== 1 ? 's' : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                <p className="font-medium">Connection error</p>
                <p>{error.message}</p>
              </div>
            )}
            <OrdersTableLive orders={orders} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <OrdersActivityFeed events={activityEvents} maxEvents={20} />

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Polling Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <dl className="grid grid-cols-2 gap-2">
                <dt className="text-muted-foreground">Interval</dt>
                <dd className="font-mono">5s</dd>

                <dt className="text-muted-foreground">Total requests</dt>
                <dd className="font-mono">{Math.floor(Date.now() / 5000)}</dd>

                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-mono">
                  {loading ? 'fetching...' : 'idle'}
                </dd>

                <dt className="text-muted-foreground">Last fetched</dt>
                <dd className="font-mono">
                  {lastFetchedAt?.toLocaleTimeString() || 'never'}
                </dd>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
