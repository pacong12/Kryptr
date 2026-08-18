'use client';

import { useState } from 'react';
import type { SignRequest, TransactionIntent } from '@kryptr/shared-types';
import { Badge } from '@kryptr/shared-ui/react/badge';
import { Button } from '@kryptr/shared-ui/react/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';
import { toast } from 'sonner';

export function SignerConsole({
  intent,
  initialSignRequest,
}: {
  intent: TransactionIntent;
  initialSignRequest?: SignRequest | null;
}) {
  const [signRequest, setSignRequest] = useState<SignRequest | null>(
    initialSignRequest ?? null
  );

  const handleManualApprove = () => {
    if (!signRequest) {
      toast.error('No sign request generated yet');
      return;
    }
    setSignRequest({
      ...signRequest,
      status: 'signed',
      note: 'Manually signed by operator via Signer Console',
    });
    toast.success('Signature approved manually');
  };

  const handleManualReject = () => {
    if (!signRequest) {
      toast.error('No sign request generated yet');
      return;
    }
    setSignRequest({
      ...signRequest,
      status: 'rejected',
      note: 'Rejected by operator via Signer Console',
    });
    toast.warning('Sign request rejected by operator');
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Signer Console</CardTitle>
            <CardDescription>
              Manual signature approval for intent #{intent.id}
            </CardDescription>
          </div>
          {signRequest && (
            <Badge
              variant={
                signRequest.status === 'signed'
                  ? 'default'
                  : signRequest.status === 'rejected'
                  ? 'destructive'
                  : 'secondary'
              }
            >
              {signRequest.status.toUpperCase()}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {signRequest ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Request ID</span>
              <span className="font-mono">{signRequest.id}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Digest</span>
              <span className="font-mono truncate max-w-[240px]">
                {signRequest.digest ?? 'N/A'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Note</span>
              <span>{signRequest.note}</span>
            </div>

            <div className="flex gap-2 pt-3">
              <Button
                variant="default"
                disabled={signRequest.status !== 'pending' && signRequest.status !== 'dry_run'}
                onClick={handleManualApprove}
                className="flex-1"
              >
                Approve Signature
              </Button>
              <Button
                variant="outline"
                disabled={signRequest.status !== 'pending' && signRequest.status !== 'dry_run'}
                onClick={handleManualReject}
                className="flex-1"
              >
                Reject Signature
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No active signature request. Approve intent in gate first.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
