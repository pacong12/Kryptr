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
import { getOrder } from '@/lib/api';
import { formatDateTime, shortenHex } from '@/lib/format';

export const metadata: Metadata = { title: 'Order · Kryptr' };

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getOrder(id);

  // Live envelope error: a genuine 404 keeps the not-found page; every
  // other code (e.g. worker_unavailable 503) renders honest degradation.
  if (order.apiError !== null) {
    if (order.apiError.code === 'order_not_found') {
      notFound();
    }
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/orders">← Orders</Link>
          </Button>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {id}
          </h1>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Order details</CardTitle>
            <CardDescription>
              GET /api/orders/:id answered with an error
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Order unavailable — {order.apiError.message}
            </p>
          </CardContent>
        </Card>
        <Suspense fallback={<ExecutionTimelineSkeleton />}>
          <ExecutionTimeline orderId={id} />
        </Suspense>
      </div>
    );
  }

  // Unreachable API with no fixture for this id behaves like a 404.
  if (order.data === null) {
    notFound();
  }
  const data = order.data;

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
          <OrderStatusBadge status={data.status} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Order details</CardTitle>
            <CardAction>{order.mock ? <MockDataBadge /> : null}</CardAction>
            <CardDescription>
              Frozen Order shape · served via GET /api/orders/:id
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Type</dt>
              <dd>
                <OrderTypeBadge type={data.type} />
              </dd>
              <dt className="text-muted-foreground">Side</dt>
              <dd>
                <OrderSideBadge side={data.side} />
              </dd>
              <dt className="text-muted-foreground">Wallet</dt>
              <dd className="font-mono">{data.walletId}</dd>
              <dt className="text-muted-foreground">Chain</dt>
              <dd className="font-mono">{data.chain}</dd>
              <dt className="text-muted-foreground">Base asset</dt>
              <dd className="font-mono">
                {data.baseAsset === null
                  ? 'native'
                  : shortenHex(data.baseAsset)}
              </dd>
              <dt className="text-muted-foreground">Quote asset</dt>
              <dd className="font-mono">
                {data.quoteAsset === null
                  ? 'native'
                  : shortenHex(data.quoteAsset)}
              </dd>
              <dt className="text-muted-foreground">Amount (raw)</dt>
              <dd className="font-mono">{data.amount}</dd>
              <dt className="text-muted-foreground">Limit price</dt>
              <dd className="font-mono">{data.limitPrice ?? '—'}</dd>
              <dt className="text-muted-foreground">Interval</dt>
              <dd className="font-mono">{data.interval ?? 'once'}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDateTime(data.createdAt)}</dd>
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
