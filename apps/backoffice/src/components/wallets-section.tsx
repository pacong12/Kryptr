import type { AgentWallet } from '@kryptr/shared-types';
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';
import { Skeleton } from '@kryptr/shared-ui/react/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kryptr/shared-ui/react/table';

import { getWallets } from '@/lib/api';
import { formatDateTime, shortenHex } from '@/lib/format';

import { ChainBadge, MockDataBadge } from './status-badges';

/** Presentational wallets table; both the dashboard and /wallets reuse it. */
export function WalletsTable({ wallets }: { wallets: AgentWallet[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Wallet</TableHead>
          <TableHead>Address</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Chains</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Key rotation</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {wallets.map((wallet) => (
          <TableRow key={wallet.id}>
            <TableCell className="font-medium">{wallet.id}</TableCell>
            <TableCell className="font-mono text-muted-foreground">
              {shortenHex(wallet.address)}
            </TableCell>
            <TableCell>{wallet.ownerId}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {wallet.chains.map((chain) => (
                  <ChainBadge key={chain} chain={chain} />
                ))}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDateTime(wallet.createdAt)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {wallet.lastKeyRotationAt === null
                ? 'never'
                : formatDateTime(wallet.lastKeyRotationAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export async function WalletsSection() {
  const wallets = await getWallets();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Wallets</CardTitle>
        <CardAction>{wallets.mock ? <MockDataBadge /> : null}</CardAction>
        <CardDescription>
          {wallets.data.length} agent wallet
          {wallets.data.length === 1 ? '' : 's'} from{' '}
          <span className="font-mono">GET /wallets</span>
        </CardDescription>
      </CardHeader>
      <WalletsTable wallets={wallets.data} />
    </Card>
  );
}

export function WalletsSectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <div className="space-y-2 px-6 pb-6">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </Card>
  );
}
