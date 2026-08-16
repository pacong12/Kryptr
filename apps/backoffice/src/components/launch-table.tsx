import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kryptr/shared-ui/react/table';

import { BondPaidBadge, LaunchStatusBadge } from '@/components/launch-badges';
import type { LaunchRequest } from '@/lib/fixtures';
import { formatDateTime } from '@/lib/format';

/** Presentational launch-request feed; /launch owns the data fetching. */
export function LaunchTable({ requests }: { requests: LaunchRequest[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Request</TableHead>
          <TableHead>Token</TableHead>
          <TableHead>Chain</TableHead>
          <TableHead>Bond</TableHead>
          <TableHead>Verification</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((request) => (
          <TableRow key={request.id}>
            <TableCell className="font-medium">
              <Link
                href={`/launch/${request.id}`}
                className="font-mono underline-offset-4 hover:underline"
              >
                {request.id}
              </Link>
            </TableCell>
            <TableCell>
              <span className="font-medium">{request.context.tokenSymbol}</span>
              <span className="text-muted-foreground">
                {' · '}
                {request.context.tokenName}
              </span>
            </TableCell>
            <TableCell className="font-mono text-muted-foreground">
              {request.chain}
            </TableCell>
            <TableCell>
              <BondPaidBadge paid={request.context.bondPaid} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {request.context.verification
                ? `${request.context.verification.claims.length} claims`
                : 'missing'}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDateTime(request.requestedAt)}
            </TableCell>
            <TableCell>
              <LaunchStatusBadge status={request.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
