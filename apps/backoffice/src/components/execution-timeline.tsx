import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';
import { Skeleton } from '@kryptr/shared-ui/react/skeleton';

import { ExecutionStatusBadge } from '@/components/order-badges';
import { MockDataBadge } from '@/components/status-badges';
import { getOrderExecutions } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

/**
 * Wave-4 addition (rewired): execution timeline for one order, composed
 * from the frozen OrderExecution claim-store steps (claimed → quoted →
 * submitted → confirmed / failed / cancelled / gate_rejected). A live
 * envelope error renders an honest "executions unavailable" state — never
 * the fixture and never a misleading "no executions yet". Fixtures only
 * cover an unreachable API.
 */
export async function ExecutionTimeline({ orderId }: { orderId: string }) {
  const executions = await getOrderExecutions(orderId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution timeline</CardTitle>
        <CardAction>{executions.mock ? <MockDataBadge /> : null}</CardAction>
        <CardDescription>
          Claimed executions from the order worker · GET
          /api/orders/:id/executions
        </CardDescription>
      </CardHeader>
      <CardContent>
        {executions.apiError !== null ? (
          <p className="text-sm text-muted-foreground">
            Executions unavailable — {executions.apiError.message}
          </p>
        ) : executions.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No executions yet — this order has not been claimed by the worker.
          </p>
        ) : (
          <ol className="flex flex-col gap-4 border-l border-border pl-5">
            {executions.data.map((execution) => (
              <li key={execution.id} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[25.5px] top-1 size-2.5 rounded-full bg-primary"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <ExecutionStatusBadge status={execution.status} />
                  <span className="font-mono text-xs text-muted-foreground">
                    slot {execution.slotKey}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    claimed {formatDateTime(execution.claimedAt)}
                    {execution.finishedAt === null
                      ? ''
                      : ` → finished ${formatDateTime(execution.finishedAt)}`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {execution.intentId === null
                    ? 'no gate intent minted yet'
                    : `gate intent ${execution.intentId}`}
                  {execution.detail ? ` — ${execution.detail}` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function ExecutionTimelineSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-2/3" />
      </CardContent>
    </Card>
  );
}
