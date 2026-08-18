'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Intent-detail-page auto refresh (W7-M5).
 *
 * Uses router.refresh() to re-fetch the intent detail server component on an
 * interval while the tab is visible. This provides real-time status updates
 * for the intent lifecycle (dry_run → approved → executing → done/fail).
/** Auto-refresh interval for intent detail page (W7-M5 requirement). */
const REFRESH_INTERVAL_MS = 10_000;

export function IntentDetailAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

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
