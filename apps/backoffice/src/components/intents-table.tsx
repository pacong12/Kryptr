import Link from 'next/link';
import { Button } from '@kryptr/shared-ui/react/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kryptr/shared-ui/react/table';

import type { IntentWithStatus } from '@/lib/fixtures';
import { formatDateTime, humanize } from '@/lib/format';

import { TransactionStatusBadge } from './status-badges';

/** Full transaction-intent listing; each row links to the review page. */
export function IntentsTable({ intents }: { intents: IntentWithStatus[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Intent</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Wallet</TableHead>
          <TableHead>Chain</TableHead>
          <TableHead>Origin</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>
            <span className="sr-only">Review</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {intents.map((intent) => (
          <TableRow key={intent.id}>
            <TableCell className="font-mono font-medium">{intent.id}</TableCell>
            <TableCell>{humanize(intent.kind)}</TableCell>
            <TableCell className="text-muted-foreground">
              {intent.walletId}
            </TableCell>
            <TableCell>{intent.chain}</TableCell>
            <TableCell>{intent.origin}</TableCell>
            <TableCell>
              <TransactionStatusBadge status={intent.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDateTime(intent.createdAt)}
            </TableCell>
            <TableCell>
              <Button asChild variant="ghost" size="xs">
                <Link href={`/intents/${intent.id}`}>
                  Review
                  <span className="sr-only"> intent {intent.id}</span>
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
