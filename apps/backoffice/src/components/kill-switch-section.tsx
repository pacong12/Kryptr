import { KillSwitchDialog } from '@/components/kill-switch-dialog';
import { KillSwitchModeBadge } from '@/components/order-badges';
import { MockDataBadge } from '@/components/status-badges';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';
import { Skeleton } from '@kryptr/shared-ui/react/skeleton';

import { getKillSwitchAudit, getKillSwitchState } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

/**
 * Wave-4 kill-switch section: current state, the confirm-gated mode-change
 * dialog, and the audited trail of from→to changes (freeze §3). The audit
 * endpoint shape is deck-local until the worker API ships it.
 */
export async function KillSwitchSection() {
  const [state, audit] = await Promise.all([
    getKillSwitchState(),
    getKillSwitchAudit(),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kill switch</CardTitle>
        <CardAction>
          {state.mock || audit.mock ? <MockDataBadge /> : null}
        </CardAction>
        <CardDescription>
          Automation-wide halt · GET /api/automation/kill-switch (+audit)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.apiError !== null ? (
          <p className="text-sm text-muted-foreground">
            Kill switch state unavailable — {state.apiError.message}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <KillSwitchModeBadge mode={state.data.mode} />
            {state.data.mode !== 'off' ? (
              <span className="text-sm text-muted-foreground">
                activated {formatDateTime(state.data.activatedAt ?? '')}
                {state.data.reason ? ` — ${state.data.reason}` : ''}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                automation running normally
              </span>
            )}
            <KillSwitchDialog />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Audit trail</span>
          {audit.apiError !== null ? (
            <p className="text-sm text-muted-foreground">
              Audit trail unavailable — {audit.apiError.message}
            </p>
          ) : audit.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No kill-switch changes recorded.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {audit.data.map((entry, index) => (
                <li
                  key={`${entry.at}-${index}`}
                  className="rounded-md border border-border px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatDateTime(entry.at)}
                    </span>
                    <span className="font-mono text-xs">{entry.actor}</span>
                    <span className="text-xs text-muted-foreground">
                      {entry.from} → {entry.to}
                    </span>
                  </div>
                  {entry.reason ? (
                    <p className="text-xs text-muted-foreground">
                      {entry.reason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function KillSwitchSectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-16 w-full" />
      </CardContent>
    </Card>
  );
}
