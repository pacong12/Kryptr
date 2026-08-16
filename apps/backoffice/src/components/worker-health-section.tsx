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
import { getWorkerHealth } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

/**
 * Wave-4 addition: order-worker health in the feeds-card style. Fetches
 * GET /api/health/worker and degrades to fixtures (mock badge) when the API
 * is unreachable. `ok === false` renders the degraded badge with the API's
 * detail string (e.g. 'redis_unreachable').
 */
export async function WorkerHealthSection() {
  const worker = await getWorkerHealth();
  const { data } = worker;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order worker</CardTitle>
        <CardAction>{worker.mock ? <MockDataBadge /> : null}</CardAction>
        <CardDescription>
          Automation worker · GET /api/health/worker
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="font-mono text-sm">{data.component}</span>
            <span className="text-xs text-muted-foreground">
              checked {formatDateTime(data.checkedAt)}
            </span>
          </div>
          {data.ok ? (
            <Badge variant="default">operational</Badge>
          ) : (
            <Badge variant="destructive">degraded</Badge>
          )}
        </div>
        {!data.ok && data.detail ? (
          <p className="rounded-md border border-border px-3 py-2 font-mono text-xs text-muted-foreground">
            {data.detail}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function WorkerHealthSectionSkeleton() {
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
