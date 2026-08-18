import type { SignRequest, SignRequestStatus } from '@kryptr/shared-types';
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

import { getSignRequests } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

import { MockDataBadge } from './status-badges';

// ponytail: variant map covers only the four statuses in SignRequestStatus;
// add entries here if the enum grows.
const STATUS_VARIANTS: Record<
  SignRequestStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  dry_run: 'outline',
  pending: 'secondary',
  signed: 'default',
  rejected: 'destructive',
};

function SignRequestStatusBadge({ status }: { status: SignRequestStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{status}</Badge>;
}

/** Truncate digest to first 10 hex chars + '…' for readability. */
function truncateDigest(digest: `0x${string}` | null): string {
  if (!digest) return 'N/A';
  // keep '0x' prefix + 8 chars = 10 chars total
  return `${digest.slice(0, 10)}…`;
}

/**
 * Wave-6 dashboard signing console.
 * Server component — data fetched here, auto-refreshed by the existing
 * DashboardAutoRefresh (router.refresh()) already mounted on the page.
 */
export async function SigningConsoleSection() {
  const { data: requests, mock } = await getSignRequests();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signing Console</CardTitle>
        <CardAction>{mock ? <MockDataBadge /> : null}</CardAction>
        <CardDescription>
          Pending SignRequests awaiting operator action
        </CardDescription>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sign requests found.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {requests.map((req) => (
              <SignRequestRow key={req.id} req={req} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SignRequestRow({ req }: { req: SignRequest }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2 text-sm">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">
          Intent{' '}
          <span
            className="font-mono text-xs text-muted-foreground"
            data-testid="intent-id"
          >
            {req.intentId}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          digest:{' '}
          <span className="font-mono" data-testid="digest">
            {truncateDigest(req.digest)}
          </span>{' '}
          · {formatDateTime(req.createdAt)}
        </span>
      </span>
      <span data-testid="status-badge">
        <SignRequestStatusBadge status={req.status} />
      </span>
    </div>
  );
}

export function SigningConsoleSectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </CardContent>
    </Card>
  );
}
