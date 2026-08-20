'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type TelemetryMetrics = {
  activeIntents: number;
  p99LatencyMs: number;
  errorRatePercent: number;
  lastUpdated: string;
};

export function LiveTelemetryTicker() {
  const [metrics, setMetrics] = useState<TelemetryMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchMetrics(): Promise<void> {
    try {
      const response = await fetch('/api/health/telemetry');
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
      } else {
        throw new Error('Failed to fetch telemetry');
      }
    } catch {
      // Silently fail, show skeleton
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Active Intents
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : metrics ? (
            <div className="text-2xl font-bold">{metrics.activeIntents}</div>
          ) : (
            <div className="text-2xl font-bold text-destructive">-</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            P99 Latency
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : metrics ? (
            <div className={`text-2xl font-bold ${metrics.p99LatencyMs > 500 ? 'text-destructive' : ''}`}>
              {metrics.p99LatencyMs}ms
            </div>
          ) : (
            <div className="text-2xl font-bold text-destructive">-</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Error Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : metrics ? (
            <div className={`text-2xl font-bold ${metrics.errorRatePercent > 5 ? 'text-destructive' : ''}`}>
              {metrics.errorRatePercent.toFixed(1)}%
            </div>
          ) : (
            <div className="text-2xl font-bold text-destructive">-</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
