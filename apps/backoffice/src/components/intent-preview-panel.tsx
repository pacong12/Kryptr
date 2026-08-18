import type { TransactionIntent } from '@kryptr/shared-types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';

export function IntentPreviewPanel({ intent }: { intent: TransactionIntent }) {
  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle>Transaction Intent Preview</CardTitle>
        <CardDescription>
          Detailed preview of calldata and parameters before signing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between py-1 border-b">
          <span className="text-muted-foreground">Intent ID</span>
          <span className="font-mono">{intent.id}</span>
        </div>
        <div className="flex justify-between py-1 border-b">
          <span className="text-muted-foreground">Wallet ID</span>
          <span className="font-mono">{intent.walletId}</span>
        </div>
        <div className="flex justify-between py-1 border-b">
          <span className="text-muted-foreground">Chain</span>
          <span className="font-mono">{intent.chain}</span>
        </div>
        <div className="flex justify-between py-1 border-b">
          <span className="text-muted-foreground">Kind</span>
          <span className="font-semibold">{intent.kind}</span>
        </div>
        <div className="flex justify-between py-1 border-b">
          <span className="text-muted-foreground">Origin</span>
          <span>{intent.origin}</span>
        </div>
        <div className="flex justify-between py-1 border-b">
          <span className="text-muted-foreground">Target (to)</span>
          <span className="font-mono">{intent.to ?? 'N/A'}</span>
        </div>
        <div className="flex justify-between py-1 border-b">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-mono">{intent.amount}</span>
        </div>
        {intent.swap && (
          <div className="flex flex-col gap-1 pt-2 border-t">
            <span className="text-muted-foreground font-semibold">
              Swap Context
            </span>
            <pre className="p-2 text-xs rounded bg-muted font-mono overflow-x-auto">
              {JSON.stringify(intent.swap, null, 2)}
            </pre>
          </div>
        )}
        {intent.deploy && (
          <div className="flex flex-col gap-1 pt-2 border-t">
            <span className="text-muted-foreground font-semibold">
              Deploy Context
            </span>
            <pre className="p-2 text-xs rounded bg-muted font-mono overflow-x-auto">
              {JSON.stringify(intent.deploy, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
