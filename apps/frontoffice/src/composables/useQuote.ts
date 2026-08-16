import {
  computed,
  onScopeDispose,
  ref,
  toValue,
  type MaybeRefOrGetter,
} from 'vue';
import type { ApiError, QuoteRequest, SwapQuote } from '@kryptr/shared-types';
import { apiPost } from '@/lib/api';

/** Phases of the quote lifecycle; the composable owns the machine. */
export type QuoteState = 'idle' | 'quoting' | 'ready' | 'expired' | 'error';

/**
 * Owns the quote lifecycle: request → live expiry countdown → expired.
 *
 * Quotes steer value, so there is deliberately NO fixture fallback — any
 * failure (unreachable API, non-envelope response, rejected quote) surfaces
 * as the `error` state and the UI fails closed. Components never fetch.
 */
export function useQuote(walletId: MaybeRefOrGetter<string>) {
  const status = ref<QuoteState>('idle');
  const quote = ref<SwapQuote | null>(null);
  const error = ref<ApiError | null>(null);
  const now = ref(Date.now());
  let requestSeq = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  /** Whole seconds until `quote.expiresAt`; 0 once lapsed. */
  const secondsLeft = computed(() => {
    if (!quote.value) return 0;
    const remaining = Date.parse(quote.value.expiresAt) - now.value;
    return Math.max(0, Math.floor(remaining / 1000));
  });

  /** Live state: a ready quote flips to expired the moment it lapses. */
  const state = computed<QuoteState>(() =>
    status.value === 'ready' && secondsLeft.value <= 0
      ? 'expired'
      : status.value,
  );

  function stopTimer(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function startTimer(): void {
    stopTimer();
    now.value = Date.now();
    timer = setInterval(() => {
      now.value = Date.now();
    }, 1000);
  }

  /** Request a fresh quote; superseded requests are ignored on resolution. */
  async function refresh(
    params: Omit<QuoteRequest, 'walletId'>,
  ): Promise<void> {
    const seq = ++requestSeq;
    status.value = 'quoting';
    error.value = null;
    stopTimer();
    const body: QuoteRequest = { walletId: toValue(walletId), ...params };
    const result = await apiPost<SwapQuote>('/quotes', body);
    if (seq !== requestSeq) return;
    if (result.ok && result.data) {
      quote.value = result.data;
      status.value = 'ready';
      startTimer();
    } else {
      quote.value = null;
      status.value = 'error';
      error.value = result.error ?? {
        code: 'unknown',
        message: 'Unable to fetch a swap quote.',
      };
    }
  }

  /** Drop the current quote (e.g. when the pair or amount is cleared). */
  function clear(): void {
    requestSeq += 1;
    stopTimer();
    quote.value = null;
    error.value = null;
    status.value = 'idle';
  }

  onScopeDispose(stopTimer);

  return { state, quote, secondsLeft, error, refresh, clear };
}
