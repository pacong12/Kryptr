import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Button } from '@kryptr/shared-ui/react/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';

import {
  ExecutionTimeline,
  ExecutionTimelineSkeleton,
} from '@/components/execution-timeline';
import {
  OrderSideBadge,
  OrderStatusBadge,
  OrderTypeBadge,
} from '@/components/order-badges';
import { MockDataBadge } from '@/components/status-badges';
import { getOrders } from '@/lib/api';
import { formatDateTime, shortenHex } from '@/lib/format';

export const metadata: Metadata = { title: 'Order · Kryptr' };

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orders = await getOrders();
  const order = orders.data.find((entry) => entry.id === id);
  if (!order) {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/orders">← Orders</Link>
          </Button>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {id}
          </h1>
          <OrderStatusBadge status={order.status} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Order details</CardTitle>
            <CardAction>{orders.mock ? <MockDataBadge /> : null}</CardAction>
            <CardDescription>
              Frozen Order shape · served via GET /api/orders
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Type</dt>
              <dd>
                <OrderTypeBadge type={order.type} />
              </dd>
              <dt className="text-muted-foreground">Side</dt>
              <dd>
                <OrderSideBadge side={order.side} />
              </dd>
              <dt className="text-muted-foreground">Wallet</dt>
              <dd className="font-mono">{order.walletId}</dd>
              <dt className="text-muted-foreground">Chain</dt>
              <dd className="font-mono">{order.chain}</dd>
              <dt className="text-muted-foreground">Base asset</dt>
              <dd className="font-mono">
                {order.baseAsset === null
                  ? 'native'
                  : shortenHex(order.baseAsset)}
              </dd>
              <dt className="text-muted-foreground">Quote asset</dt>
              <dd className="font-mono">
                {order.quoteAsset === null
                  ? 'native'
                  : shortenHex(order.quoteAsset)}
              </dd>
              <dt className="text-muted-foreground">Amount (raw)</dt>
              <dd className="font-mono">{order.amount}</dd>
              <dt className="text-muted-foreground">Limit price</dt>
              <dd className="font-mono">{order.limitPrice ?? '—'}</dd>
              <dt className="text-muted-foreground">Interval</dt>
              <dd className="font-mono">{order.interval ?? 'once'}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDateTime(order.createdAt)}</dd>
            </dl>
          </CardContent>
        </Card>

        <Suspense fallback={<ExecutionTimelineSkeleton />}>
          <ExecutionTimeline orderId={id} />
        </Suspense>
      </div>
    </div>
  );
}
