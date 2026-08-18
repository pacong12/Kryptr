'use client';

import { useEffect, useRef } from 'react';
import { Badge } from '@kryptr/shared-ui/react/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';
import { formatDateTime } from '@/lib/format';

export interface OrderEvent {
  id: string;
  orderId: string;
  timestamp: Date;
  type: 'created' | 'scheduled' | 'executed' | 'cancelled' | 'rejected';
  amount?: string;
  status?: string;
  reason?: string;
}

interface OrdersActivityFeedProps {
  events: OrderEvent[];
  maxEvents?: number;
}

/**
 * W7-M6: Real-time activity feed for order events.
 * Shows chronological order lifecycle events with auto-scroll.
 */
export function OrdersActivityFeed({
  events = [],
  maxEvents = 50,
}: OrdersActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && events.length > 0) {
      // Auto-scroll to newest entries
      const el = scrollRef.current.lastElementChild as HTMLElement;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [events]);

  const eventColors: Record<OrderEvent['type'], string> = {
    created: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    scheduled: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    executed: 'bg-green-500/10 text-green-400 border-green-500/20',
    cancelled: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  const filteredEvents = events.slice(-maxEvents).reverse();

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Activity Feed</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          ref={scrollRef}
          className="flex max-h-[300px] flex-col gap-2 overflow-y-auto"
        >
          {filteredEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity</p>
          ) : (
            filteredEvents.map((event) => (
              <div
                key={`${event.id}-${event.timestamp.toISOString()}`}
                className="group flex items-start gap-3 rounded-md border border-border p-2 hover:bg-accent/50"
              >
                <div className="mt-0.5 size-2 shrink-0 rounded-full bg-primary" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`border ${eventColors[event.type]} text-xs`}
                    >
                      {event.type.toUpperCase()}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {event.orderId}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(event.timestamp.toISOString())}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">
                    {event.amount ? `Amount: ${event.amount}` : null}
                    {event.reason ? ` — Reason: ${event.reason}` : null}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
