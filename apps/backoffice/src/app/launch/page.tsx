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

import { DashboardAutoRefresh } from '@/components/dashboard-refresh';
import { LaunchTable } from '@/components/launch-table';
import { MockDataBadge } from '@/components/status-badges';
import { getLaunchRequests } from '@/lib/api';

export const metadata: Metadata = { title: 'Launch · Kryptr' };

/**
 * Wave-5 launch-request review feed. Operators scrutinize every deploy
 * before it reaches the factory (memo deck §2.4): status, bond-paid and
 * verification coverage at a glance, detail on the request page.
 */
export default function LaunchPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <DashboardAutoRefresh />
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Launch</h1>
          <p className="text-sm text-muted-foreground">
            Token launch requests awaiting an operator deploy decision — approve
            or reject with an audited reason.
          </p>
        </div>
      </header>

      <div className="grid gap-6">
        <Suspense fallback={<LaunchSectionSkeleton />}>
          <LaunchSection />
        </Suspense>
      </div>
    </div>
  );
}

async function LaunchSection() {
  const requests = await getLaunchRequests();
  const pending = requests.data.filter(
    (entry) => entry.status === 'pending_review',
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Launch requests</CardTitle>
        <CardAction>{requests.mock ? <MockDataBadge /> : null}</CardAction>
        <CardDescription>
          GET /api/launch/requests · {pending} pending review
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LaunchTable requests={requests.data} />
      </CardContent>
    </Card>
  );
}

function LaunchSectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </CardContent>
    </Card>
  );
}
