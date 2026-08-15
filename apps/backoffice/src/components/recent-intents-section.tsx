import Link from 'next/link';
import { Button } from '@kryptr/shared-ui/react/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';
import { Skeleton } from '@kryptr/shared-ui/react/skeleton';

import { getRecentIntents } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';

import { MockDataBadge, TransactionStatusBadge } from './status-badges';

/**
 * Recent TransactionIntents with status badges. Wave 1 renders the static
 * fixture feed (vault ships no intents endpoint yet); every row links to the
 * intent review page.
 */
export async function RecentIntentsSection() {
  const intents = await getRecentIntents();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent intents</CardTitle>
        <CardAction>{intents.mock ? <MockDataBadge /> : null}</CardAction>
        <CardDescription>
          Latest transaction intents awaiting or past the security gate
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {intents.data.map((intent) => (
          <Button
            key={intent.id}
            asChild
            variant="ghost"
            size="sm"
            className="h-auto justify-between gap-3 py-2 text-left"
          >
            <Link href={`/intents/${intent.id}`}>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">
                  {humanize(intent.kind)}{' '}
                  <span className="font-mono text-xs text-muted-foreground">
                    {intent.id}
                  </span>
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {intent.origin} · {intent.chain} ·{' '}
                  {formatDateTime(intent.createdAt)}
                </span>
              </span>
              <TransactionStatusBadge status={intent.status} />
            </Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

export function RecentIntentsSectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}
