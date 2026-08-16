import type { ChainId } from './chains.js';

export const ORDER_TYPES = ['limit', 'stop', 'dca', 'twap'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = [
  'pending_approval',
  'open',
  'paused',
  'triggered',
  'filled',
  'partially_filled',
  'cancelled',
  'rejected',
  'expired',
  'failed',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Order {
  id: string;
  walletId: string;
  type: OrderType;
  status: OrderStatus;
  chain: ChainId;
  /** Asset being bought/sold (contract address or null for native). */
  baseAsset: `0x${string}` | null;
  /** Quote asset used for pricing. */
  quoteAsset: `0x${string}` | null;
  side: 'buy' | 'sell';
  /** Raw units as string. */
  amount: string;
  limitPrice: string | null;
  /** ISO-8601 interval for dca/twap, e.g. "P1D". */
  interval: string | null;
  createdAt: string;
}

/**
 * Kill switch (wave 4). Checked at execution/claim time, not only at
 * evaluation — a mode change must stop in-flight scheduling before any
 * side effect. Every mode change is an audited server action.
 */
export const KILL_SWITCH_MODES = ['off', 'pause_new', 'cancel_active'] as const;
export type KillSwitchMode = (typeof KILL_SWITCH_MODES)[number];

export interface KillSwitchState {
  mode: KillSwitchMode;
  /** ISO-8601; null while mode === 'off'. */
  activatedAt: string | null;
  reason: string | null;
}

/**
 * One audited kill-switch mode change (freeze §3). Shared contract for
 * every surface that renders the audit trail (backoffice deck, face);
 * moved here from the deck-local shape per wave-4 stage-B ruling.
 */
export interface KillSwitchAuditEntry {
  actor: string;
  /** ISO-8601. */
  at: string;
  from: KillSwitchMode;
  to: KillSwitchMode;
  reason: string | null;
}

/**
 * Envelope error codes produced by the order worker (wave 4), mirroring the
 * wave-3 fail-closed pattern (e.g. 'aggregator_unconfigured'). UI maps these
 * to human messages; never raw stack traces.
 */
export const WORKER_ERROR_CODES = [
  'worker_unavailable',
  'order_not_found',
  'order_not_live',
  'order_type_unsupported',
  'trigger_price_unknown',
  'trigger_price_stale',
  'kill_switch_active',
  'duplicate_execution',
  'execution_gate_rejected',
  'quote_unavailable',
] as const;
export type WorkerErrorCode = (typeof WORKER_ERROR_CODES)[number];

/** Feeds-style health card for the worker (DeckUI/FaceUI status display). */
export interface WorkerHealth {
  component: 'order-worker';
  ok: boolean;
  /** e.g. 'redis_unreachable' when ok === false. */
  detail?: string;
  checkedAt: string;
}

/** One observed trigger price. 'static' is dev-only (hermetic tests). */
export interface TriggerPricePrint {
  source: 'chainlink' | 'coingecko' | 'static';
  priceUsd: string;
  observedAt: string;
  /** Chainlink aggregator proxy address when source === 'chainlink'. */
  feedAddress?: `0x${string}`;
  roundId?: string;
}

export const TRIGGER_OUTCOMES = [
  'armed',
  'triggered',
  'skip_stale',
  'skip_deviation',
  'needs_human_approval',
] as const;
export type TriggerOutcome = (typeof TRIGGER_OUTCOMES)[number];

/** Result of one scheduler tick against one order slot. */
export interface TriggerEvaluation {
  orderId: string;
  /** DCA ISO slot (e.g. '2026-08-17T00:00:00.000Z') or 'once' for limit. */
  slotKey: string;
  primary: TriggerPricePrint | null;
  hint: TriggerPricePrint | null;
  outcome: TriggerOutcome;
  detail?: string;
  evaluatedAt: string;
}

export const EXECUTION_STATUSES = [
  'claimed',
  'gate_rejected',
  'quoted',
  'submitted',
  'confirmed',
  'failed',
  'cancelled',
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

/**
 * One claimed execution of an order slot (SpendLedger/claim-store pattern:
 * the claim happens BEFORE any side effect and is the exactly-once guard
 * across worker restarts).
 */
export interface OrderExecution {
  /** Deterministic: '<orderId>:<slotKey>'. */
  id: string;
  orderId: string;
  slotKey: string;
  /** Present once the gate intent was minted: 'intent:<orderId>:<slotKey>'. */
  intentId: string | null;
  status: ExecutionStatus;
  claimedAt: string;
  finishedAt: string | null;
  detail?: string;
}
