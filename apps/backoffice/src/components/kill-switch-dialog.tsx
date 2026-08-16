'use client';

import type { KillSwitchMode } from '@kryptr/shared-types';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kryptr/shared-ui/react/select';
import { toast } from 'sonner';

import { setKillSwitchMode } from '@/app/orders/actions';

/**
 * Wave-4 kill-switch confirmation dialog. The mode select and reason input
 * are mandatory — freeze §3 requires every change to be audited. On success
 * the parent route re-renders (router.refresh) so the new state + audit
 * entry are refetched from the API.
 */
export function KillSwitchDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<KillSwitchMode>('pause_new');
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const reasonId = useId();

  const confirm = () => {
    startTransition(async () => {
      const result = await setKillSwitchMode(mode, reason);
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
        <Button variant="outline">Change mode…</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change kill-switch mode</DialogTitle>
          <DialogDescription>
            pause_new blocks new executions but leaves active orders running;
            cancel_active also cancels every open/paused order. Both are audited
            — give a reason.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label>Mode</Label>
            <Select
              value={mode}
              onValueChange={(value) => setMode(value as KillSwitchMode)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pause_new">
                  pause_new — block new executions
                </SelectItem>
                <SelectItem value="cancel_active">
                  cancel_active — cancel open &amp; paused orders
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={reasonId}>Reason</Label>
            <Input
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. stale oracle feed — halting automation"
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
            variant="destructive"
            onClick={confirm}
            disabled={isPending || reason.trim().length === 0}
          >
            {isPending ? 'Applying…' : 'Confirm kill switch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
