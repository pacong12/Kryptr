'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@kryptr/shared-ui/react/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kryptr/shared-ui/react/dialog';
import { Input } from '@kryptr/shared-ui/react/input';
import { Label } from '@kryptr/shared-ui/react/label';
import { toast } from 'sonner';

import { decideLaunchReview, type LaunchDecision } from '@/app/launch/actions';

/**
 * Wave-5 HITL deploy decision dialog. The reason is mandatory — every
 * approve/reject is audited. On success the parent route re-renders
 * (router.refresh) so the recorded decision is refetched. Like the
 * kill-switch dialog, failures toast honestly: a decision that did not
 * reach the launchpad is never presented as recorded.
 */
export function LaunchDecisionDialog({
  launchId,
  decision,
}: {
  launchId: string;
  decision: LaunchDecision;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const reasonId = useId();

  const approving = decision === 'approved';

  const confirm = () => {
    startTransition(async () => {
      const result = await decideLaunchReview(launchId, decision, reason);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        setReason('');
        router.refresh();
        return;
      }
      toast.error(result.message);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={approving ? 'default' : 'destructive'}>
          {approving ? 'Approve deploy…' : 'Reject deploy…'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {approving ? 'Approve deploy' : 'Reject deploy'}
          </DialogTitle>
          <DialogDescription>
            {approving
              ? 'Approving lets the deploy proceed through the factory exactly as frozen in the deploy context. '
              : 'Rejecting blocks this deploy request. '}
            The decision is audited — give a reason.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={reasonId}>Reason</Label>
            <Input
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                approving
                  ? 'e.g. T21 battery clean, fee split at norms'
                  : 'e.g. fee split off-norm, verification missing'
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant={approving ? 'default' : 'destructive'}
            onClick={confirm}
            disabled={isPending || reason.trim().length === 0}
          >
            {isPending
              ? 'Recording…'
              : approving
                ? 'Confirm approval'
                : 'Confirm rejection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
