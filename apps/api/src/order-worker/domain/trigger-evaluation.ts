import type {
  Order,
  TriggerEvaluation,
  TriggerPricePrint,
} from '@kryptr/shared-types';

/**
 * Pure trigger logic (wave 4, freeze §4). Time uses the injected clock
 * exclusively (#22 lesson). Limit orders need BOTH sources (primary +
 * hint) fresh and within the deviation bound; anything unknown fails
 * closed with 'needs_human_approval' and the order stays open.
 */

export interface TriggerConfig {
  /** TRIGGER_MAX_AGE_MS — default 2_700_000 (45m). */
  maxAgeMs: number;
  /** TRIGGER_DEVIATION_BPS — default 50 (0.5%). */
  deviationBps: number;
}

export const DEFAULT_TRIGGER_CONFIG: TriggerConfig = {
  maxAgeMs: 2_700_000,
  deviationBps: 50,
};

/** Limit orders fire at most once. */
export const LIMIT_SLOT_KEY = 'once';

function priceOf(print: TriggerPricePrint): number | null {
  const value = Number(print.priceUsd);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function isStale(print: TriggerPricePrint, nowMs: number, maxAgeMs: number) {
  return nowMs - Date.parse(print.observedAt) > maxAgeMs;
}

/**
 * One scheduler pass over a limit order. Fail-closed ladder: unknown
 * (either source missing/unparseable) -> stale -> deviation -> side-aware
 * price comparison.
 */
export function evaluateLimitTrigger(input: {
  order: Order;
  primary: TriggerPricePrint | null;
  hint: TriggerPricePrint | null;
  nowMs: number;
  config?: TriggerConfig;
}): TriggerEvaluation {
  const { order, primary, hint, nowMs } = input;
  const config = input.config ?? DEFAULT_TRIGGER_CONFIG;
  const base = {
    orderId: order.id,
    slotKey: LIMIT_SLOT_KEY,
    primary,
    hint,
    evaluatedAt: new Date(nowMs).toISOString(),
  };

  if (!primary || !hint) {
    return {
      ...base,
      outcome: 'needs_human_approval',
      detail:
        !primary && !hint
          ? 'trigger_price_unknown: both sources unavailable'
          : !primary
            ? 'trigger_price_unknown: primary source unavailable'
            : 'trigger_price_unknown: hint source unavailable',
    };
  }
  const primaryPrice = priceOf(primary);
  const hintPrice = priceOf(hint);
  if (primaryPrice === null || hintPrice === null) {
    return {
      ...base,
      outcome: 'needs_human_approval',
      detail: 'trigger_price_unknown: unparseable print',
    };
  }
  if (isStale(primary, nowMs, config.maxAgeMs)) {
    return {
      ...base,
      outcome: 'skip_stale',
      detail: 'trigger_price_stale: primary print exceeded max age',
    };
  }
  if (isStale(hint, nowMs, config.maxAgeMs)) {
    return {
      ...base,
      outcome: 'skip_stale',
      detail: 'trigger_price_stale: hint print exceeded max age',
    };
  }
  const deviationBps =
    (Math.abs(primaryPrice - hintPrice) / primaryPrice) * 10_000;
  if (deviationBps > config.deviationBps) {
    return {
      ...base,
      outcome: 'skip_deviation',
      detail: `sources disagree by ${deviationBps.toFixed(1)} bps (> ${config.deviationBps} bps)`,
    };
  }

  const limitPrice = Number(order.limitPrice);
  if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
    return {
      ...base,
      outcome: 'needs_human_approval',
      detail: 'limit price missing or invalid',
    };
  }
  const triggered =
    order.side === 'buy'
      ? primaryPrice <= limitPrice
      : primaryPrice >= limitPrice;
  return {
    ...base,
    outcome: triggered ? 'triggered' : 'armed',
    detail: triggered
      ? `price ${primaryPrice} crossed limit ${limitPrice} (${order.side})`
      : `price ${primaryPrice} not yet at limit ${limitPrice} (${order.side})`,
  };
}

/**
 * DCA is TIME-triggered: the slot owns the trigger, price prints ride
 * along for observability only. Valuation still fails closed at the gate
 * during execution (unknown price -> needs_human_approval there).
 */
export function evaluateDcaSlot(input: {
  order: Order;
  slotKey: string;
  primary: TriggerPricePrint | null;
  hint: TriggerPricePrint | null;
  nowMs: number;
}): TriggerEvaluation {
  const { order, slotKey, primary, hint, nowMs } = input;
  return {
    orderId: order.id,
    slotKey,
    primary,
    hint,
    outcome: 'triggered',
    detail:
      primary === null && hint === null
        ? 'dca slot due; trigger prints unavailable (gate valuation still fail-closed)'
        : 'dca slot due',
    evaluatedAt: new Date(nowMs).toISOString(),
  };
}
