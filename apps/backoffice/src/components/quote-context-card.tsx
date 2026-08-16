import type { TransactionIntent } from '@kryptr/shared-types';
import { ChevronDownIcon } from 'lucide-react';
import { Badge } from '@kryptr/shared-ui/react/badge';
import { Button } from '@kryptr/shared-ui/react/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@kryptr/shared-ui/react/collapsible';
import { Progress } from '@kryptr/shared-ui/react/progress';

import { ExpiryBadge } from '@/components/expiry-badge';
import { MockDataBadge } from '@/components/status-badges';
import { getQuote } from '@/lib/api';
import { shortenHex } from '@/lib/format';

/** Full-scale value for the slippage gauge (300 bps = 3%). */
const SLIPPAGE_GAUGE_MAX_BPS = 300;

function assetLabel(asset: `0x${string}` | null): string {
  return asset === null ? 'native' : shortenHex(asset);
}

function QuoteField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</dd>
    </div>
  );
}

/**
 * Wave-2 addition: read-only quote bound to a swap intent (rendered only for
 * kind === 'swap'). Fetches GET /api/quotes/:quoteId; an unavailable quote
 * renders an honest note, and fixtures only cover an unreachable API.
 */
export async function QuoteContextCard({
  intent,
}: {
  intent: TransactionIntent;
}) {
  const swap = intent.swap;
  if (!swap) {
    return null;
  }

  const quote = await getQuote(swap.quoteId);

  if (!quote.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Quote context</CardTitle>
          <CardDescription>
            Quote {swap.quoteId} is unavailable
            {quote.apiError ? ` — ${quote.apiError.message}` : ''}.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { data } = quote;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quote context</CardTitle>
        <CardAction className="flex items-center gap-2">
          <Badge variant="outline">{data.source}</Badge>
          <ExpiryBadge expiresAt={data.expiresAt} />
          {quote.mock ? <MockDataBadge /> : null}
        </CardAction>
        <CardDescription>
          Bound quote {data.id} · GET /api/quotes/:id
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
          <QuoteField
            label="Asset in"
            value={assetLabel(data.assetIn)}
            mono={data.assetIn !== null}
          />
          <QuoteField label="Amount in" value={data.amountIn} mono />
          <QuoteField label="Rate" value={String(data.price)} />
          <QuoteField
            label="Asset out"
            value={assetLabel(data.assetOut)}
            mono={data.assetOut !== null}
          />
          <QuoteField label="Amount out" value={data.amountOut} mono />
          <QuoteField label="Worst-case out" value={data.minAmountOut} mono />
        </dl>

        <div className="grid gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Slippage tolerance</span>
            <span className="font-medium">{data.slippageBps} bps</span>
          </div>
          <Progress
            value={Math.min(
              (data.slippageBps / SLIPPAGE_GAUGE_MAX_BPS) * 100,
              100,
            )}
            aria-label={`Slippage tolerance ${data.slippageBps} basis points`}
          />
        </div>

        {data.fees && data.fees.length > 0 ? (
          <div className="grid gap-1">
            <span className="text-sm text-muted-foreground">Fees</span>
            {data.fees.map((fee, index) => (
              <span
                key={`${fee.asset ?? 'native'}-${index}`}
                className="font-mono text-sm"
              >
                {fee.amount} {assetLabel(fee.asset)}
              </span>
            ))}
          </div>
        ) : null}

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">
              Route · {data.route.length}{' '}
              {data.route.length === 1 ? 'hop' : 'hops'}
              <ChevronDownIcon />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {data.route.length === 0 ? (
              <p className="pt-3 text-sm text-muted-foreground">
                Single-venue quote — no multi-hop route.
              </p>
            ) : (
              <ol className="flex flex-col gap-2 pt-3">
                {data.route.map((hop, index) => (
                  <li
                    key={`${hop.venue}-${index}`}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2"
                  >
                    <Badge variant="secondary">{hop.venue}</Badge>
                    <span className="font-mono text-xs">
                      {assetLabel(hop.assetIn)} → {assetLabel(hop.assetOut)}
                    </span>
                    {hop.amountIn && hop.amountOut ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {hop.amountIn} → {hop.amountOut}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
