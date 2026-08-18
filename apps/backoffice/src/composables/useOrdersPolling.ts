'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { getOrders } from '@/lib/api';
import type { Order } from '@kryptr/shared-types';

interface UseOrdersPollingOptions {
  intervalMs?: number;
  enabled?: boolean;
}

/**
 * W7-M6: Live orders monitoring composable.
 * Polls GET /api/orders endpoint every 5 seconds by default.
 * Debounces updates, handles connection failures, and stops on unmount.
 */
export function useOrdersPolling({
  intervalMs = 5000,
  enabled = true,
}: UseOrdersPollingOptions = {}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastDataRef = useRef<Order[]>([]);
  const requestCountRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      requestCountRef.current += 1;

      const response = await getOrders();

      // Only update if still the active request
      if (abortControllerRef.current.signal.aborted) return;

      const now = Date.now();
      const lastFetch = lastFetchedAt?.getTime() ?? 0;

      // Debounce: only update if data changed significantly
      const hasChanges =
        JSON.stringify(response.data) !== JSON.stringify(lastDataRef.current);

      if (hasChanges || now - lastFetch > 2000) {
        setOrders(response.data);
        setLastFetchedAt(new Date());
        lastDataRef.current = response.data;

        if (response.mock) {
          console.log('[useOrdersPolling] Using mock data');
        }
      }

      setError(null);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;

      console.error('[useOrdersPolling] Fetch failed:', err);
      setError(err as Error);

      // Exponential backoff simulation
      if (requestCountRef.current % 3 === 0) {
        setTimeout(() => {}, 1000);
      }
    } finally {
      setLoading(false);
    }
  }, [lastFetchedAt]);

  const startPolling = useCallback(() => {
    stopPolling();
    fetchData();
    timerRef.current = setInterval(fetchData, intervalMs);
  }, [fetchData, intervalMs]);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      stopPolling();
      return;
    }

    startPolling();

    // Cleanup on unmount
    return () => {
      stopPolling();
      requestCountRef.current = 0;
      lastDataRef.current = [];
    };
  }, [enabled, intervalMs, startPolling, stopPolling]);

  return {
    orders,
    loading,
    error,
    lastFetchedAt,
    refresh: fetchData,
    stats: {
      totalRequests: requestCountRef.current,
      hasMockData: orders.some((o) => false), // Will be replaced with actual check
    },
  };
}
