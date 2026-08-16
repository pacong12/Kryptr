'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCwIcon } from 'lucide-react';
import { Button } from '@kryptr/shared-ui/react/button';

/**
 * Wave-3 polling fold-in (closes docs/tasks/followups.md item 1).
 *
 * Dashboard-only auto refresh: router.refresh() re-runs the current route's
 * server components, so every dashboard section (health, feeds, chains,
 * wallets, recent intents) re-fetches in place. The intent detail page and
 * its decision panel are a different route and stay untouched.
 */

/** Middle of the mission's 10–15s cadence. */
const REFRESH_INTERVAL_MS = 12_000;

/**
 * Renders nothing; re-fetches the current route on an interval while the tab
 * is visible. Timers are torn down on unmount and paused while hidden.
 */
export function DashboardAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const refresh = () => {
      if (document.visibilityState === 'visible') {
        router.refresh();
      }
    };
    const start = () => {
      if (timer === null) {
        timer = setInterval(refresh, REFRESH_INTERVAL_MS);
      }
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [router]);

  return null;
}

/** Manual companion to the interval — one on-demand re-fetch. */
export function RefreshButton() {
  const router = useRouter();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => router.refresh()}
      aria-label="Refresh dashboard data"
    >
      <RefreshCwIcon aria-hidden />
      Refresh
    </Button>
  );
}
