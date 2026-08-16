import { Badge } from '@kryptr/shared-ui/react/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';
import { Skeleton } from '@kryptr/shared-ui/react/skeleton';

import { MockDataBadge } from '@/components/status-badges';
import { getFactoryHealth } from '@/lib/api';
import { formatDateTime, shortenHex } from '@/lib/format';

/**
 * Wave-5 addition: launch-factory health in the worker-card style. Fetches
 * GET /api/health/launchpad (assumed path — the deploy-gate branch owns the
 * real contract) and degrades to fixtures (mock badge) when the API is
 * unreachable. `ok === false` renders the degraded badge with the API's
 * detail string.
 */
export async function FactoryHealthSection() {
  const factory = await getFactoryHealth();
  const { data } = factory;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Launch factory</CardTitle>
        <CardAction>{factory.mock ? <MockDataBadge /> : null}</CardAction>
        <CardDescription>
          Deploy factory · GET /api/health/launchpad
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="font-mono text-sm">{data.component}</span>
            <span className="text-xs text-muted-foreground">
              {shortenHex(data.factory)} · {data.chain} · checked{' '}
              {formatDateTime(data.checkedAt)}
            </span>
          </div>
          {data.ok ? (
            <Badge variant="default">operational</Badge>
          ) : (
            <Badge variant="destructive">degraded</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {data.pendingReviews} launch request
          {data.pendingReviews === 1 ? '' : 's'} pending review
        </p>
        {!data.ok && data.detail ? (
          <p className="rounded-md border border-border px-3 py-2 font-mono text-xs text-muted-foreground">
            {data.detail}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function FactoryHealthSectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-52" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-8 w-full" />
      </CardContent>
    </Card>
  );
}
