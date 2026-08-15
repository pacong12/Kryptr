'use client';

import { useState, useTransition } from 'react';
import type { SecurityDecision } from '@kryptr/shared-types';
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
import { toast } from 'sonner';

import { DecisionResultBadge } from '@/components/status-badges';
import { formatDateTime } from '@/lib/format';

import { approveIntent, rejectIntent } from './actions';

/**
 * Approve/reject a TransactionIntent through the security gate. Renders the
 * SecurityDecision fields and updates them with the gate's (or, in wave 1,
 * the local stub's) response.
 */
export function IntentDecisionPanel({
  intentId,
  initialDecision,
}: {
  intentId: string;
  initialDecision: SecurityDecision;
}) {
  const [decision, setDecision] = useState(initialDecision);
  const [stubbed, setStubbed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const decide = (result: 'approved' | 'rejected') => {
    const action = result === 'approved' ? approveIntent : rejectIntent;
    startTransition(async () => {
      const outcome = await action(intentId);
      setDecision(outcome.decision);
      setStubbed(outcome.stubbed);
      if (outcome.stubbed) {
        toast.warning(
          `${result === 'approved' ? 'Approved' : 'Rejected'} via local stub — security gate endpoint pending wave 2.`,
        );
      } else {
        toast.success(`Intent ${result} by the security gate.`);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security decision</CardTitle>
        <CardAction>
          <DecisionResultBadge result={decision.result} />
          {stubbed ? (
            <Badge variant="outline">pending wave-2 gate</Badge>
          ) : null}
        </CardAction>
        <CardDescription>
          Fields of the SecurityDecision recorded for this intent
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-1 text-sm">
          <dt className="text-muted-foreground">Intent</dt>
          <dd className="font-mono">{decision.intentId}</dd>
          <dt className="mt-2 text-muted-foreground">Result</dt>
          <dd>{decision.result.replaceAll('_', ' ')}</dd>
          <dt className="mt-2 text-muted-foreground">Reason</dt>
          <dd>{decision.reason}</dd>
          <dt className="mt-2 text-muted-foreground">Decided at</dt>
          <dd>{formatDateTime(decision.decidedAt)}</dd>
        </dl>
        <div className="flex gap-2">
          <Button
            onClick={() => decide('approved')}
            disabled={isPending}
            className="flex-1"
          >
            Approve
          </Button>
          <Button
            variant="destructive"
            onClick={() => decide('rejected')}
            disabled={isPending}
            className="flex-1"
          >
            Reject
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Approve/Reject POSTs to{' '}
          <span className="font-mono">/api/security/intents/:id/decision</span>
          (contract agreed with vault); the endpoint ships in wave 2, until then
          a local stub responds and is flagged above.
        </p>
      </CardContent>
    </Card>
  );
}
