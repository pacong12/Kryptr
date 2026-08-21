'use client';

import { useEffect, useRef, useState } from 'react';

type IntentEvent = {
  intentId: string;
  status: string;
  timestamp: string;
};

export function useIntentStatus() {
  const [events, setEvents] = useState<IntentEvent[]>([]);
  const [isSSE, setIsSSE] = useState<boolean>(true);
  const sseRef = useRef<EventSource | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  function handleSSE(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data) as IntentEvent;
      setEvents((prev) => [...prev.slice(-49), data]);
    } catch {
      // Ignore malformed events
    }
  }

  function onSSError(): void {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    
    setIsSSE(false);
    startPolling();
  }

  function startPolling(): void {
    clearInterval(pollRef.current!);
    
    pollRef.current = setInterval(() => {
      fetch('/api/security/intents/status')
        .then((res) => res.json())
        .then((data) => {
          const intents: IntentEvent[] = Array.isArray(data) ? data : [];
          setEvents(intents.slice(-50));
        })
        .catch(() => {});
    }, 3000);
  }

  function stopPolling(): void {
    clearInterval(pollRef.current!);
    pollRef.current = null;
  }

  useEffect(() => {
    try {
      const sse = new EventSource('/api/security/intents/stream');
      sseRef.current = sse;
      
      sse.addEventListener('message', handleSSE);
      sse.addEventListener('error', onSSError);
      setIsSSE(true);
    } catch {
      setIsSSE(false);
      startPolling();
    }

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
      }
      clearInterval(pollRef.current!);
    };
  }, []);

  return {
    events,
    isSSE,
    retryConnect: () => window.location.reload(),
  };
}
