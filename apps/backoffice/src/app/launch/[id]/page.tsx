import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
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
  BondPaidBadge,
  LaunchStatusBadge,
  VerificationClaimBadge,
} from '@/components/launch-badges';
import { LaunchDecisionDialog } from '@/components/launch-decision-dialog';
import { MockDataBadge } from '@/components/status-badges';
import { getLaunchRequest } from '@/lib/api';
import { formatDateTime, formatUnits, shortenHex } from '@/lib/format';

export const metadata: Metadata = { title: 'Launch request · Kryptr' };

/** Decision condition 1 requires at least these two verified claims. */
const REQUIRED_CLAIMS = ['admin_key_free', 'non_upgradeable'] as const;

export default async function LaunchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = await getLaunchRequest(id);

  // Live envelope error: a genuine 404 keeps the not-found page; every
  // other code renders honest degradation (order-detail precedent).
  if (request.apiError !== null) {
    if (request.apiError.code === 'launch_request_not_found') {
      notFound();
    }
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/launch">← Launch</Link>
          </Button>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {id}
          </h1>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Launch request</CardTitle>
            <CardDescription>
              GET /api/launch/requests/:id answered with an error
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Launch request unavailable — {request.apiError.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Unreachable API with no fixture for this id behaves like a 404.
  if (request.data === null) {
    notFound();
  }
  const data = request.data;
  const { context } = data;
  const verification = context.verification ?? null;
  const verifiedKinds = new Set(
    verification?.claims.map((claim) => claim.claim) ?? [],
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/launch">← Launch</Link>
          </Button>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {id}
          </h1>
          <LaunchStatusBadge status={data.status} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Launch request</CardTitle>
              <CardAction>{request.mock ? <MockDataBadge /> : null}</CardAction>
              <CardDescription>
                Frozen DeployContext · served via GET /api/launch/requests/:id
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <dt className="text-muted-foreground">Token</dt>
                <dd>
                  {context.tokenName}{' '}
                  <span className="text-muted-foreground">
                    ({context.tokenSymbol})
                  </span>
                </dd>
                <dt className="text-muted-foreground">Chain</dt>
                <dd className="font-mono">{data.chain}</dd>
                <dt className="text-muted-foreground">Total supply (raw)</dt>
                <dd className="font-mono">{context.totalSupply}</dd>
                <dt className="text-muted-foreground">Total supply</dt>
                <dd className="font-mono">
                  {formatUnits(context.totalSupply, 18)}
                  <span className="text-muted-foreground"> (18-dec)</span>
                </dd>
                <dt className="text-muted-foreground">Factory</dt>
                <dd className="font-mono">{shortenHex(context.factory)}</dd>
                <dt className="text-muted-foreground">Bond</dt>
                <dd>
                  <BondPaidBadge paid={context.bondPaid} />
                </dd>
                <dt className="text-muted-foreground">Requested by</dt>
                <dd className="font-mono">{data.requestedBy}</dd>
                <dt className="text-muted-foreground">Requested</dt>
                <dd>{formatDateTime(data.requestedAt)}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fee schedule</CardTitle>
              <CardDescription>
                Float shares are the constructor args; integer-bps mirrors are
                the gate&apos;s validation basis (Q1 ruling)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <dt className="text-muted-foreground">Creator</dt>
                <dd className="font-mono">
                  {context.feeSchedule.creatorShare} · {context.feeBps.creator}{' '}
                  bps
                </dd>
                <dt className="text-muted-foreground">LP</dt>
                <dd className="font-mono">
                  {context.feeSchedule.lpShare} · {context.feeBps.lp} bps
                </dd>
                <dt className="text-muted-foreground">Protocol</dt>
                <dd className="font-mono">
                  {context.feeSchedule.protocolShare} ·{' '}
                  {context.feeBps.protocol} bps
                </dd>
                <dt className="text-muted-foreground">Buyback</dt>
                <dd className="font-mono">
                  {context.feeSchedule.buybackShare} · {context.feeBps.buyback}{' '}
                  bps
                </dd>
                <dt className="text-muted-foreground">Creator recipient</dt>
                <dd className="font-mono">
                  {shortenHex(context.feeRecipients.creator)}
                </dd>
                <dt className="text-muted-foreground">LP recipient</dt>
                <dd className="font-mono">
                  {shortenHex(context.feeRecipients.lp)}
                </dd>
                <dt className="text-muted-foreground">Protocol recipient</dt>
                <dd className="font-mono">
                  {shortenHex(context.feeRecipients.protocol)}
                </dd>
                <dt className="text-muted-foreground">Buyback recipient</dt>
                <dd className="font-mono">
                  {shortenHex(context.feeRecipients.buyback)}
                </dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Verification (T21)</CardTitle>
              <CardDescription>
                Claims frozen at consent — what the user saw is what the
                decision audited
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {verification === null ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  No verification artifact attached. The deploy-gate requires
                  one for allowlisted factories — treat this request as
                  unverified.
                </p>
              ) : (
                <>
                  <div className="flex flex-col gap-1 text-sm">
                    <span className="font-mono">{verification.id}</span>
                    <span className="break-all font-mono text-xs text-muted-foreground">
                      {verification.hash}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {verification.claims.map((claim) => (
                      <li
                        key={claim.claim}
                        className="flex flex-wrap items-center gap-2 text-sm"
                      >
                        <VerificationClaimBadge claim={claim.claim} />
                        {claim.evidence ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            {claim.evidence}
                          </span>
                        ) : null}
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(claim.verifiedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Required claims:{' '}
                    {REQUIRED_CLAIMS.map((kind) => (
                      <span key={kind} className="font-medium">
                        {kind.replaceAll('_', ' ')}{' '}
                        {verifiedKinds.has(kind) ? '✓' : '✗'}{' '}
                      </span>
                    ))}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Deploy decision</CardTitle>
            <CardDescription>
              HITL review — every decision is audited with a reason
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {data.status === 'pending_review' ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Scrutinize the deploy context, fee split and verification
                  battery before deciding. Approving lets the deploy proceed
                  through the factory exactly as frozen.
                </p>
                {!context.bondPaid ? (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    Bond is not paid — the deploy-gate will refuse this deploy
                    regardless of approval.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <LaunchDecisionDialog
                    launchId={data.id}
                    decision="approved"
                  />
                  <LaunchDecisionDialog
                    launchId={data.id}
                    decision="rejected"
                  />
                </div>
              </>
            ) : (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <dt className="text-muted-foreground">Decision</dt>
                <dd>
                  <LaunchStatusBadge status={data.status} />
                </dd>
                <dt className="text-muted-foreground">Decided</dt>
                <dd>{data.decidedAt ? formatDateTime(data.decidedAt) : '—'}</dd>
                <dt className="text-muted-foreground">Decided by</dt>
                <dd className="font-mono">{data.decidedBy ?? '—'}</dd>
                <dt className="text-muted-foreground">Reason</dt>
                <dd>{data.decisionReason ?? '—'}</dd>
              </dl>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
