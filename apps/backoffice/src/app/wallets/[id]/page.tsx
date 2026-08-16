import { Suspense } from 'react';
import Link from 'next/link';
import type { WalletBalance } from '@kryptr/shared-types';
import { ArrowLeftIcon } from 'lucide-react';
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
import { Skeleton } from '@kryptr/shared-ui/react/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kryptr/shared-ui/react/table';

import { ChainBadge, MockDataBadge } from '@/components/status-badges';
import { getWalletBalances, getWallets } from '@/lib/api';
import { formatDateTime, formatUnits, shortenHex } from '@/lib/format';

/** Native balance is always denominated in the chain's 18-decimal asset. */
const NATIVE_DECIMALS = 18;

function ChainBalanceBlock({ balance }: { balance: WalletBalance }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ChainBadge chain={balance.chain} />
        <span className="text-xs text-muted-foreground">
          native{' '}
          <span className="font-mono">
            {formatUnits(balance.nativeBalance, NATIVE_DECIMALS)}
          </span>
        </span>
      </div>
      {balance.tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No token holdings on this chain.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Token</TableHead>
              <TableHead>Contract</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {balance.tokens.map((token) => (
              <TableRow
                key={`${token.contractAddress ?? 'native'}-${token.symbol}`}
              >
                <TableCell className="font-medium">{token.symbol}</TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {token.contractAddress === null
                    ? 'native'
                    : shortenHex(token.contractAddress)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatUnits(token.amount, token.decimals)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/**
 * Wave-3 addition: per-chain balances for one wallet via the existing
 * GET /api/wallets/:id/balances endpoint. A live envelope error renders an
 * honest note; fixtures only cover an unreachable API.
 */
async function BalancesSection({ walletId }: { walletId: string }) {
  const balances = await getWalletBalances(walletId);

  if (!balances.mock && balances.apiError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Balances</CardTitle>
          <CardDescription>
            Balances unavailable — {balances.apiError.message}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Balances</CardTitle>
        <CardAction>{balances.mock ? <MockDataBadge /> : null}</CardAction>
        <CardDescription>
          Native and token holdings per chain · GET /api/wallets/:id/balances
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {balances.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No balances recorded for this wallet.
          </p>
        ) : (
          balances.data.map((balance) => (
            <ChainBalanceBlock key={balance.chain} balance={balance} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function BalancesSectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
  );
}

export default async function WalletDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const wallets = await getWallets();
  const wallet = wallets.data.find((entry) => entry.id === id);
  if (!wallet) notFound();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/wallets">
              <ArrowLeftIcon aria-hidden />
              All wallets
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {wallet.id}
          </h1>
          <div className="flex flex-wrap gap-1">
            {wallet.chains.map((chain) => (
              <ChainBadge key={chain} chain={chain} />
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {wallet.ownerId} · {shortenHex(wallet.address)} · created{' '}
          {formatDateTime(wallet.createdAt)} · key rotation{' '}
          {wallet.lastKeyRotationAt === null
            ? 'never'
            : formatDateTime(wallet.lastKeyRotationAt)}
        </p>
      </header>

      <Suspense fallback={<BalancesSectionSkeleton />}>
        <BalancesSection walletId={wallet.id} />
      </Suspense>
    </div>
  );
}
