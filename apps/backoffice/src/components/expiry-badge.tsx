'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@kryptr/shared-ui/react/badge';

import { formatDateTime, formatUptime } from '@/lib/format';

/**
 * Quote expiry indicator with a ticking countdown.
 *
 * Hydration-safe: the first client render reproduces the server output
 * (static expiry timestamp); the countdown starts only after mount, so the
 * server and client trees never disagree on the initial markup.
 */
export function ExpiryBadge({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  const expiresAtMs = Date.parse(expiresAt);

  if (now === null) {
    return <Badge variant="outline">expires {formatDateTime(expiresAt)}</Badge>;
  }

  const remainingSec = Math.floor((expiresAtMs - now) / 1000);
  if (remainingSec <= 0) {
    return <Badge variant="destructive">expired</Badge>;
  }
  return (
    <Badge variant="outline">expires in {formatUptime(remainingSec)}</Badge>
  );
}
