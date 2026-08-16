import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';
import { Skeleton } from '@kryptr/shared-ui/react/skeleton';

import { FeedStatusBadge, MockDataBadge } from '@/components/status-badges';
import { getFeeds } from '@/lib/api';
import { formatUptime } from '@/lib/format';

/**
 * Wave-2 addition: external data-feed health beside the API health card.
 * Fetches GET /api/health/feeds and degrades to fixtures (mock badge)
 * when the API is unreachable.
 */
export async function FeedsSection() {
  const feeds = await getFeeds();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data feeds</CardTitle>
        <CardAction>{feeds.mock ? <MockDataBadge /> : null}</CardAction>
        <CardDescription>
          Price oracles and aggregator feeds · GET /api/health/feeds
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {feeds.data.map((feed) => (
          <div
            key={feed.feedId}
            className="flex items-center justify-between gap-3"
          >
            <div className="flex min-w-0 flex-col">
              <span className="font-mono text-sm">{feed.feedId}</span>
              <span className="text-xs text-muted-foreground">
                source {feed.source} · price age{' '}
                {feed.priceAgeSec === null
                  ? 'unavailable'
                  : formatUptime(feed.priceAgeSec)}
              </span>
            </div>
            <FeedStatusBadge status={feed.status} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function FeedsSectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </CardContent>
    </Card>
  );
}
