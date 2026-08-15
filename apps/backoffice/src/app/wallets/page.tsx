import Link from 'next/link';
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';
import { Button } from '@kryptr/shared-ui/react/button';

import { MockDataBadge } from '@/components/status-badges';
import { WalletsTable } from '@/components/wallets-section';
import { getWallets } from '@/lib/api';

export default async function WalletsPage() {
  const wallets = await getWallets();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Wallets</h1>
        <p className="text-sm text-muted-foreground">
          Agent wallets under Kryptr custody — one security policy and key
          rotation schedule per wallet.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>All wallets</CardTitle>
          <CardAction>
            {wallets.mock ? <MockDataBadge /> : null}
            <Button asChild variant="ghost" size="sm">
              <Link href="/">Back to dashboard</Link>
            </Button>
          </CardAction>
          <CardDescription>
            {wallets.data.length} wallet{wallets.data.length === 1 ? '' : 's'}{' '}
            from <span className="font-mono">GET /wallets</span>
          </CardDescription>
        </CardHeader>
        <WalletsTable wallets={wallets.data} />
      </Card>
    </div>
  );
}
