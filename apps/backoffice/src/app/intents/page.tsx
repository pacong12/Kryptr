import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';

import { IntentsTable } from '@/components/intents-table';
import { MockDataBadge } from '@/components/status-badges';
import { getRecentIntents } from '@/lib/api';

/**
 * Intent review queue. Wave 1 renders the fixture feed (mock mode) — the
 * table is wired so swapping in a live listing endpoint only touches
 * src/lib/api.ts.
 */
export default async function IntentsPage() {
  const intents = await getRecentIntents();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Intents</h1>
        <p className="text-sm text-muted-foreground">
          Every transaction starts as an intent; the security gate decides
          before anything is signed.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Review queue</CardTitle>
          <CardAction>{intents.mock ? <MockDataBadge /> : null}</CardAction>
          <CardDescription>
            {intents.data.length} transaction intent
            {intents.data.length === 1 ? '' : 's'} — select one to inspect the
            security decision
          </CardDescription>
        </CardHeader>
        <IntentsTable intents={intents.data} />
      </Card>
    </div>
  );
}
