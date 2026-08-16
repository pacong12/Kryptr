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
import { getIntentTimeline } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';

/**
 * Wave-2 addition: vertical lifecycle timeline for an intent, composed from
 * IntentTimelineStep primitives (step, actor, detail, timestamp). A live
 * envelope error renders the empty state; fixtures cover an unreachable API.
 */
export async function IntentTimeline({ intentId }: { intentId: string }) {
  const timeline = await getIntentTimeline(intentId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision timeline</CardTitle>
        <CardAction>{timeline.mock ? <MockDataBadge /> : null}</CardAction>
        <CardDescription>
          Lifecycle steps from the security gate · GET
          /api/security/intents/:id/timeline
        </CardDescription>
      </CardHeader>
      <CardContent>
        {timeline.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No timeline yet.</p>
        ) : (
          <ol className="flex flex-col gap-4 border-l border-border pl-5">
            {timeline.data.map((step, index) => (
              <li key={`${step.step}-${step.at}-${index}`} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[25.5px] top-1 size-2.5 rounded-full bg-primary"
                />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-medium">
                    {humanize(step.step)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(step.at)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {step.actor}
                  {step.detail ? ` — ${step.detail}` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function IntentTimelineSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-2/3" />
      </CardContent>
    </Card>
  );
}
