import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';
import { Separator } from '@kryptr/shared-ui/react/separator';
import { Skeleton } from '@kryptr/shared-ui/react/skeleton';

import { getHealth } from '@/lib/api';
import { formatUptime } from '@/lib/format';

import { HealthStatusBadge, MockDataBadge } from './status-badges';

export async function HealthSection() {
  const health = await getHealth();
  const status = health.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>API health</CardTitle>
        <CardAction>
          <HealthStatusBadge status={status.status} />
          {health.mock ? <MockDataBadge /> : null}
        </CardAction>
        <CardDescription>
          {status.service} · version {status.version}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>
            Uptime{' '}
            <span className="text-foreground">
              {formatUptime(status.uptimeSec)}
            </span>
          </span>
          <Separator orientation="vertical" className="h-4" />
          <span>
            Checked via{' '}
            <span className="font-mono text-foreground">GET /api/health</span>
          </span>
        </div>
        {health.mock ? (
          <p className="mt-3 text-sm text-muted-foreground">
            The API is unreachable
            {health.apiError
              ? ` (${health.apiError.code}: ${health.apiError.message})`
              : null}
            — showing a degraded placeholder instead of live data.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function HealthSectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-72" />
      </CardContent>
    </Card>
  );
}
