import type { Metadata } from 'next';
import { Suspense } from 'react';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';
import { Skeleton } from '@kryptr/shared-ui/react/skeleton';

import {
  DashboardAutoRefresh,
  RefreshButton,
} from '@/components/dashboard-refresh';
import {
  KillSwitchSection,
  KillSwitchSectionSkeleton,
} from '@/components/kill-switch-section';
import { MockDataBadge } from '@/components/status-badges';
import { KillSwitchModeBadge } from '@/components/order-badges';
import { OrdersTable } from '@/components/orders-table';
import { getKillSwitchState, getOrders } from '@/lib/api';

export const metadata: Metadata = { title: 'Orders · Kryptr' };

export default function OrdersPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <DashboardAutoRefresh />
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground">
            Automation orders, the kill switch and its audit trail.
          </p>
        </div>
        <RefreshButton />
      </header>

      <div className="grid gap-6">
        <Suspense fallback={<KillSwitchSectionSkeleton />}>
          <KillSwitchSection />
        </Suspense>
        <Suspense fallback={<OrdersSectionSkeleton />}>
          <OrdersSection />
        </Suspense>
      </div>
    </div>
  );
}

async function OrdersSection() {
  const [orders, kill] = await Promise.all([getOrders(), getKillSwitchState()]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Orders</CardTitle>
        <CardAction>
          <div className="flex items-center gap-2">
            {kill.apiError === null && kill.data.mode !== 'off' ? (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                kill switch:
                <KillSwitchModeBadge mode={kill.data.mode} />
              </span>
            ) : null}
            {orders.mock && orders.apiError === null ? <MockDataBadge /> : null}
          </div>
        </CardAction>
        <CardDescription>
          All automation orders · GET /api/orders
        </CardDescription>
      </CardHeader>
      <CardContent>
        {orders.apiError !== null ? (
          <p className="text-sm text-muted-foreground">
            Orders unavailable — {orders.apiError.message}
          </p>
        ) : orders.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <OrdersTable orders={orders.data} />
        )}
      </CardContent>
    </Card>
  );
}

function OrdersSectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-2/3" />
      </CardContent>
    </Card>
  );
}
