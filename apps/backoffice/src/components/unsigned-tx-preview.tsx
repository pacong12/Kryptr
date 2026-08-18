import type { UnsignedTxPreview } from '@kryptr/shared-types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';
import { shortenHex } from '@/lib/format';

/**
 * Unsigned transaction preview display for W7-M5.
 * Shows the to address, value in wei, and encoded calldata from an
 * UnsignedTxPreview object. Data can be decoded further when a proper ABI
 * is available (TODO: add decoder integration).
 */
export function UnsignedTxPreview({
  unsignedTx,
}: {
  unsignedTx: UnsignedTxPreview;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Unsigned transaction preview</CardTitle>
        <CardDescription>
          Raw transaction echo before signing — shown for auditability
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">To address</dt>
          <dd className="font-mono text-sm">
            {unsignedTx.to === '0x0' || !unsignedTx.to
              ? '—'
              : shortenHex(unsignedTx.to)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Value (wei)</dt>
          <dd className="font-mono text-sm">{unsignedTx.value}</dd>
        </div>
        <div className="min-w-0 flex-1">
          <dt className="text-xs text-muted-foreground max-w-full truncate">
            Data (hex)
          </dt>
          <dd className="font-mono text-sm break-all">
            {unsignedTx.data && unsignedTx.data !== '0x'
              ? shortenHex(unsignedTx.data)
              : '—'}
          </dd>
        </div>
      </CardContent>
    </Card>
  );
}
