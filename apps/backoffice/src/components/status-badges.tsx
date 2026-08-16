import type {
  FeedStatus,
  HealthStatus,
  SecurityCheckResult,
  TransactionStatus,
} from '@kryptr/shared-types';
import { Badge } from '@kryptr/shared-ui/react/badge';

import { humanize } from '@/lib/format';

const TRANSACTION_STATUS_VARIANTS: Record<
  TransactionStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending_approval: 'secondary',
  queued: 'outline',
  submitted: 'default',
  confirmed: 'default',
  failed: 'destructive',
  rejected: 'destructive',
};

export function TransactionStatusBadge({
  status,
}: {
  status: TransactionStatus;
}) {
  return (
    <Badge variant={TRANSACTION_STATUS_VARIANTS[status]}>
      {humanize(status)}
    </Badge>
  );
}

const DECISION_RESULT_VARIANTS: Record<
  SecurityCheckResult,
  'default' | 'secondary' | 'destructive'
> = {
  approved: 'default',
  needs_human_approval: 'secondary',
  rejected: 'destructive',
};

export function DecisionResultBadge({
  result,
}: {
  result: SecurityCheckResult;
}) {
  return (
    <Badge variant={DECISION_RESULT_VARIANTS[result]}>{humanize(result)}</Badge>
  );
}

const HEALTH_STATUS_VARIANTS: Record<
  HealthStatus['status'],
  'default' | 'secondary' | 'destructive'
> = {
  healthy: 'default',
  degraded: 'secondary',
  down: 'destructive',
};

export function HealthStatusBadge({
  status,
}: {
  status: HealthStatus['status'];
}) {
  return <Badge variant={HEALTH_STATUS_VARIANTS[status]}>{status}</Badge>;
}

const FEED_STATUS_VARIANTS: Record<
  FeedStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  healthy: 'default',
  stale: 'secondary',
  down: 'destructive',
  unconfigured: 'outline',
};

export function FeedStatusBadge({ status }: { status: FeedStatus }) {
  return <Badge variant={FEED_STATUS_VARIANTS[status]}>{status}</Badge>;
}

/** Marks data served from local fixtures instead of the live API. */
export function MockDataBadge() {
  return <Badge variant="outline">mock data</Badge>;
}

export function ChainBadge({ chain }: { chain: string }) {
  return <Badge variant="outline">{chain}</Badge>;
}
