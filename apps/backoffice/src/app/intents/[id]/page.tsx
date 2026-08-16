import { Suspense } from 'react';
import Link from 'next/link';
import type { SecurityDecision } from '@kryptr/shared-types';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@kryptr/shared-ui/react/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';
import { notFound } from 'next/navigation';

import { TransactionStatusBadge } from '@/components/status-badges';
import {
  IntentTimeline,
  IntentTimelineSkeleton,
} from '@/components/intent-timeline';
import { QuoteContextCard } from '@/components/quote-context-card';
import { MOCK_DECISIONS, MOCK_INTENTS } from '@/lib/fixtures';
import { formatDateTime, humanize, shortenHex } from '@/lib/format';

import { IntentDecisionPanel } from './decision-panel';

function DetailItem({
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
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</dd>
    </div>
  );
}

export default async function IntentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const intent = MOCK_INTENTS.find((entry) => entry.id === id);
  if (!intent) notFound();

  // Wave-1 decision state lives in fixtures; later waves fetch it from vault.
  const initialDecision: SecurityDecision = MOCK_DECISIONS[intent.id] ?? {
    intentId: intent.id,
    result: 'needs_human_approval',
    reason: 'No decision recorded yet — awaiting operator review.',
    decidedAt: intent.createdAt,
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/intents">
              <ArrowLeftIcon aria-hidden />
              All intents
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {intent.id}
          </h1>
          <TransactionStatusBadge status={intent.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {humanize(intent.kind)} intent from {intent.origin} on {intent.chain}
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Intent details</CardTitle>
              <CardDescription>
                TransactionIntent as produced by the originating agent — signing
                never happens without a security decision
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <DetailItem label="Intent ID" value={intent.id} mono />
                <DetailItem label="Wallet" value={intent.walletId} mono />
                <DetailItem label="Chain" value={intent.chain} />
                <DetailItem label="Kind" value={humanize(intent.kind)} />
                <DetailItem
                  label="To"
                  value={intent.to === null ? '—' : shortenHex(intent.to)}
                  mono
                />
                <DetailItem
                  label="Asset"
                  value={
                    intent.asset === null ? 'native' : shortenHex(intent.asset)
                  }
                  mono
                />
                <DetailItem
                  label="Amount (raw units)"
                  value={intent.amount}
                  mono
                />
                <DetailItem label="Origin" value={intent.origin} />
                <DetailItem
                  label="Created"
                  value={formatDateTime(intent.createdAt)}
                />
                <DetailItem label="Status" value={humanize(intent.status)} />
              </dl>
            </CardContent>
          </Card>

          {intent.kind === 'swap' ? <QuoteContextCard intent={intent} /> : null}

          <Suspense fallback={<IntentTimelineSkeleton />}>
            <IntentTimeline intentId={intent.id} />
          </Suspense>
        </div>

        <IntentDecisionPanel
          intentId={intent.id}
          initialDecision={initialDecision}
        />
      </div>
    </div>
  );
}
