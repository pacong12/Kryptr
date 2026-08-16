import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';
import { Skeleton } from '@kryptr/shared-ui/react/skeleton';

import {
  ChainReachabilityBadge,
  MockDataBadge,
} from '@/components/status-badges';
import { getChains } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

/**
 * Wave-3 addition: chain-reader connections beside the Data feeds card.
 * Fetches GET /api/health/chains (never raw RPC URLs) and degrades to
 * fixtures (mock badge) when the API is unreachable.
 */
export async function ChainConnectionsSection() {
  const chains = await getChains();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chain connections</CardTitle>
        <CardAction>{chains.mock ? <MockDataBadge /> : null}</CardAction>
        <CardDescription>
          Chain readers · GET /api/health/chains
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {chains.data.map((chain) => (
          <div
            key={chain.chainId}
            className="flex items-center justify-between gap-3"
          >
            <div className="flex min-w-0 flex-col">
              <span className="font-mono text-sm">{chain.chainId}</span>
              <span className="text-xs text-muted-foreground">
                {chain.provider} · block{' '}
                {chain.blockHeight === null
                  ? '—'
                  : chain.blockHeight.toLocaleString('en-US')}{' '}
                · latency{' '}
                {chain.latencyMs === null ? '—' : `${chain.latencyMs} ms`}
                {chain.lastBlockAt === null
                  ? ''
                  : ` · last block ${formatDateTime(chain.lastBlockAt)}`}
              </span>
            </div>
            <ChainReachabilityBadge reachable={chain.reachable} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ChainConnectionsSectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </CardContent>
    </Card>
  );
}
