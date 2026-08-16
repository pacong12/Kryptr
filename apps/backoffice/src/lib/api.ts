import type {
  AgentWallet,
  ApiEnvelope,
  ApiError,
  ChainReaderHealth,
  FeedHealth,
  HealthStatus,
  IntentTimelineStep,
  KillSwitchAuditEntry,
  KillSwitchMode,
  KillSwitchState,
  Order,
  OrderExecution,
  SecurityDecision,
  SwapQuote,
  WalletBalance,
  WorkerHealth,
} from '@kryptr/shared-types';

import {
  MOCK_BALANCES,
  MOCK_CHAINS,
  MOCK_FACTORY_HEALTH,
  MOCK_FEEDS,
  MOCK_INTENTS,
  MOCK_KILL_SWITCH,
  MOCK_KILL_SWITCH_AUDIT,
  MOCK_LAUNCH_REQUESTS,
  MOCK_ORDER_EXECUTIONS,
  MOCK_ORDERS,
  MOCK_QUOTES,
  MOCK_TIMELINES,
  MOCK_WALLETS,
  MOCK_WORKER_HEALTH,
  type FactoryHealth,
  type IntentWithStatus,
  type LaunchRequest,
} from './fixtures';

/**
 * Typed fetch wrapper for the Kryptr API (`apps/api`).
 *
 * Server components fetch through these helpers; every response is parsed as
 * an `ApiEnvelope<T>` from `@kryptr/shared-types`. When the API is
 * unreachable the helpers degrade to the wave-1 fixtures and flag the result
 * with `mock: true` so views can render a "mock data" badge.
 */

/** Base URL of the Kryptr API; override with NEXT_PUBLIC_API_URL. */
export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';
}

/**
 * Global route prefix of the NestJS API (`app.setGlobalPrefix('api')`).
 * Endpoint helpers below use controller-level paths (`/health`, `/wallets`,
 * `/security/...`); the prefix is applied once, here.
 */
const API_PREFIX = '/api';

/** Bound so an unreachable API never hangs a dashboard render. */
const REQUEST_TIMEOUT_MS = 2500;

/**
 * Mutations get their own, longer budget (rewire follow-up #1): the kill
 * switch POST must not abort while the worker is still applying the mode
 * change — a timed-out mutation can flip state server-side while the UI
 * reports "NOT changed". Reads keep the tight 2.5s budget.
 */
const MUTATION_TIMEOUT_MS = 10000;

/** Data plus provenance: was it served by the API or by local fixtures? */
export interface DataSource<T> {
  data: T;
  /** true when served from local fixtures (API unreachable or envelope error). */
  mock: boolean;
  /** Envelope error when the API responded with ok:false; null otherwise. */
  apiError: ApiError | null;
}

type FetchOutcome<T> =
  { kind: 'envelope'; envelope: ApiEnvelope<T> } | { kind: 'unreachable' };

async function fetchEnvelope<T>(
  path: string,
  init?: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<FetchOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${API_PREFIX}${path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      ...init,
      headers: {
        accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    return { kind: 'unreachable' };
  }

  try {
    const json = (await response.json()) as ApiEnvelope<T>;
    // Anything that is not an ApiEnvelope (404 HTML, proxy errors, …)
    // counts as unreachable so callers fall back to mock mode.
    if (typeof json?.ok !== 'boolean') return { kind: 'unreachable' };
    return { kind: 'envelope', envelope: json };
  } catch {
    return { kind: 'unreachable' };
  }
}

function toDataSource<T>(outcome: FetchOutcome<T>, fallback: T): DataSource<T> {
  if (
    outcome.kind === 'envelope' &&
    outcome.envelope.ok &&
    outcome.envelope.data !== null
  ) {
    return { data: outcome.envelope.data, mock: false, apiError: null };
  }
  return {
    data: fallback,
    mock: true,
    apiError: outcome.kind === 'envelope' ? outcome.envelope.error : null,
  };
}

export async function getHealth(): Promise<DataSource<HealthStatus>> {
  const outcome = await fetchEnvelope<HealthStatus>('/health');
  return toDataSource(outcome, {
    service: 'kryptr-api',
    status: 'down',
    version: 'unknown',
    uptimeSec: 0,
  });
}

export async function getWallets(): Promise<DataSource<AgentWallet[]>> {
  const outcome = await fetchEnvelope<AgentWallet[]>('/wallets');
  return toDataSource(outcome, MOCK_WALLETS);
}

/**
 * Wave 1: the recent-intents feed is fixture-only — vault has not shipped an
 * intents listing endpoint yet (see docs/tasks/deck.md retro). The panel is
 * always flagged `mock` until that contract exists.
 */
export async function getRecentIntents(): Promise<
  DataSource<IntentWithStatus[]>
> {
  return { data: MOCK_INTENTS, mock: true, apiError: null };
}

/** Result of an operator decision as returned (or stubbed) by the gate. */
export interface DecisionOutcome {
  decision: SecurityDecision;
  /** true when the decision was produced locally because the gate is not live. */
  stubbed: boolean;
}

/**
 * Approve/reject a TransactionIntent through the security gate.
 *
 * Contract agreed with vault: `POST /api/security/intents/:id/decision` with
 * body `{ result: 'approved' | 'rejected', decidedBy: string }`, responding
 * `ApiEnvelope<SecurityDecision>` (`decidedAt` stamped server-side). The
 * endpoint ships in wave 2 (needs decision persistence); until then the
 * mutation is stubbed locally and flagged `stubbed: true`.
 */
export async function decideIntent(
  intentId: string,
  result: 'approved' | 'rejected',
  decidedBy = 'backoffice:deck',
): Promise<DecisionOutcome> {
  const outcome = await fetchEnvelope<SecurityDecision>(
    `/security/intents/${encodeURIComponent(intentId)}/decision`,
    {
      method: 'POST',
      body: JSON.stringify({ result, decidedBy }),
      headers: { 'content-type': 'application/json' },
    },
    MUTATION_TIMEOUT_MS,
  );
  if (
    outcome.kind === 'envelope' &&
    outcome.envelope.ok &&
    outcome.envelope.data !== null
  ) {
    return { decision: outcome.envelope.data, stubbed: false };
  }

  // Local stub — pending wave-2 gate; drop once vault ships the endpoint.
  return {
    decision: {
      intentId,
      result,
      reason: `${result === 'approved' ? 'Approved' : 'Rejected'} by ${decidedBy} (local stub — pending wave-2 gate).`,
      decidedAt: new Date().toISOString(),
    },
    stubbed: true,
  };
}

/**
 * Wave 2: swap quote bound to a TransactionIntent (GET /api/quotes/:id).
 * When the live API answers with an envelope error (e.g. 404) we surface
 * `null` instead of a fixture, so the UI can show an honest
 * "quote unavailable" state; fixtures only cover an unreachable API.
 */
export async function getQuote(
  quoteId: string,
): Promise<DataSource<SwapQuote | null>> {
  const outcome = await fetchEnvelope<SwapQuote>(
    `/quotes/${encodeURIComponent(quoteId)}`,
  );
  if (outcome.kind === 'envelope') {
    if (outcome.envelope.ok && outcome.envelope.data !== null) {
      return { data: outcome.envelope.data, mock: false, apiError: null };
    }
    return { data: null, mock: false, apiError: outcome.envelope.error };
  }
  return { data: MOCK_QUOTES[quoteId] ?? null, mock: true, apiError: null };
}

/**
 * Wave 2: intent lifecycle steps (GET /api/security/intents/:id/timeline).
 * A live envelope error renders as an empty timeline ("no timeline yet");
 * fixtures only cover an unreachable API.
 */
export async function getIntentTimeline(
  intentId: string,
): Promise<DataSource<IntentTimelineStep[]>> {
  const outcome = await fetchEnvelope<IntentTimelineStep[]>(
    `/security/intents/${encodeURIComponent(intentId)}/timeline`,
  );
  if (outcome.kind === 'envelope') {
    if (outcome.envelope.ok && outcome.envelope.data !== null) {
      return { data: outcome.envelope.data, mock: false, apiError: null };
    }
    return { data: [], mock: false, apiError: outcome.envelope.error };
  }
  return { data: MOCK_TIMELINES[intentId] ?? [], mock: true, apiError: null };
}

/** Wave 2: external data-feed health (GET /api/health/feeds). */
export async function getFeeds(): Promise<DataSource<FeedHealth[]>> {
  const outcome = await fetchEnvelope<FeedHealth[]>('/health/feeds');
  return toDataSource(outcome, MOCK_FEEDS);
}

/** Wave 3: chain-reader health (GET /api/health/chains). */
export async function getChains(): Promise<DataSource<ChainReaderHealth[]>> {
  const outcome = await fetchEnvelope<ChainReaderHealth[]>('/health/chains');
  return toDataSource(outcome, MOCK_CHAINS);
}

/**
 * Wave 3: per-chain balances for one wallet (GET /api/wallets/:id/balances).
 * A live envelope error (e.g. unknown wallet) renders as an honest error
 * state; fixtures only cover an unreachable API.
 */
export async function getWalletBalances(
  walletId: string,
): Promise<DataSource<WalletBalance[]>> {
  const outcome = await fetchEnvelope<WalletBalance[]>(
    `/wallets/${encodeURIComponent(walletId)}/balances`,
  );
  if (outcome.kind === 'envelope') {
    if (outcome.envelope.ok && outcome.envelope.data !== null) {
      return { data: outcome.envelope.data, mock: false, apiError: null };
    }
    return { data: [], mock: false, apiError: outcome.envelope.error };
  }
  return { data: MOCK_BALANCES[walletId] ?? [], mock: true, apiError: null };
}

/** Wave 4: all automation orders (GET /api/orders). */
export async function getOrders(): Promise<DataSource<Order[]>> {
  const outcome = await fetchEnvelope<Order[]>('/orders');
  return toDataSource(outcome, MOCK_ORDERS);
}

/**
 * Wave 4, rewire: one order by id (GET /api/orders/:id). A live envelope
 * error surfaces as `apiError` (the detail page maps `order_not_found` to
 * its 404 and renders every other code honestly); fixtures only cover an
 * unreachable API.
 */
export async function getOrder(
  orderId: string,
): Promise<DataSource<Order | null>> {
  const outcome = await fetchEnvelope<Order>(
    `/orders/${encodeURIComponent(orderId)}`,
  );
  if (outcome.kind === 'envelope') {
    if (outcome.envelope.ok && outcome.envelope.data !== null) {
      return { data: outcome.envelope.data, mock: false, apiError: null };
    }
    return { data: null, mock: false, apiError: outcome.envelope.error };
  }
  return {
    data: MOCK_ORDERS.find((entry) => entry.id === orderId) ?? null,
    mock: true,
    apiError: null,
  };
}

/**
 * Wave 4: claim-store executions of one order (GET /api/orders/:id/executions).
 * A live envelope error surfaces as `apiError` — the timeline renders an
 * honest "executions unavailable" state, never the fixture and never a
 * misleading "no executions yet". Fixtures only cover an unreachable API.
 */
export async function getOrderExecutions(
  orderId: string,
): Promise<DataSource<OrderExecution[]>> {
  const outcome = await fetchEnvelope<OrderExecution[]>(
    `/orders/${encodeURIComponent(orderId)}/executions`,
  );
  if (outcome.kind === 'envelope') {
    if (outcome.envelope.ok && outcome.envelope.data !== null) {
      return { data: outcome.envelope.data, mock: false, apiError: null };
    }
    return { data: [], mock: false, apiError: outcome.envelope.error };
  }
  return {
    data: MOCK_ORDER_EXECUTIONS[orderId] ?? [],
    mock: true,
    apiError: null,
  };
}

/** Wave 4: order-worker health (GET /api/health/worker). */
export async function getWorkerHealth(): Promise<DataSource<WorkerHealth>> {
  const outcome = await fetchEnvelope<WorkerHealth>('/health/worker');
  return toDataSource(outcome, MOCK_WORKER_HEALTH);
}

/**
 * Wave 4: current kill-switch state (GET /api/automation/kill-switch).
 * Safety-critical: a LIVE envelope error is surfaced as `apiError` (never
 * masked by the 'off' fixture) so the panel renders an honest unavailable
 * state. Fixtures only cover an unreachable API.
 */
export async function getKillSwitchState(): Promise<
  DataSource<KillSwitchState>
> {
  const outcome = await fetchEnvelope<KillSwitchState>(
    '/automation/kill-switch',
  );
  if (outcome.kind === 'envelope') {
    if (outcome.envelope.ok && outcome.envelope.data !== null) {
      return { data: outcome.envelope.data, mock: false, apiError: null };
    }
    return {
      data: MOCK_KILL_SWITCH,
      mock: false,
      apiError: outcome.envelope.error,
    };
  }
  return { data: MOCK_KILL_SWITCH, mock: true, apiError: null };
}

/**
 * Wave 4: audited kill-switch mode changes
 * (GET /api/automation/kill-switch/audit). Deck-local entry shape until the
 * worker API ships the endpoint. Like the state getter, a live envelope
 * error is surfaced rather than masked by fixtures.
 */
export async function getKillSwitchAudit(): Promise<
  DataSource<KillSwitchAuditEntry[]>
> {
  const outcome = await fetchEnvelope<KillSwitchAuditEntry[]>(
    '/automation/kill-switch/audit',
  );
  if (outcome.kind === 'envelope') {
    if (outcome.envelope.ok && outcome.envelope.data !== null) {
      return { data: outcome.envelope.data, mock: false, apiError: null };
    }
    return {
      data: MOCK_KILL_SWITCH_AUDIT,
      mock: false,
      apiError: outcome.envelope.error,
    };
  }
  return { data: MOCK_KILL_SWITCH_AUDIT, mock: true, apiError: null };
}

/** Outcome of a kill-switch mode change attempt. */
export interface KillSwitchOutcome {
  /** New state — only present when the API confirmed the change. */
  state: KillSwitchState | null;
  /** Envelope error code from the API, or 'worker_unavailable' when unreachable. */
  code: string | null;
  /** True only when the API confirmed the mode change. */
  applied: boolean;
}

/**
 * Wave-4 kill-switch mutation (freeze §3): POST /api/automation/kill-switch
 * with `{ mode, reason }`, envelope-wrapped KillSwitchState on success.
 *
 * Unlike wave-1 decideIntent there is NO fake-success stub here: a kill
 * switch that cannot reach the worker must report failure honestly — the
 * mission requires the client stub to throw an envelope error instead.
 */
export async function requestKillSwitchMode(
  mode: KillSwitchMode,
  reason: string,
): Promise<KillSwitchOutcome> {
  const outcome = await fetchEnvelope<KillSwitchState>(
    '/automation/kill-switch',
    {
      method: 'POST',
      body: JSON.stringify({ mode, reason }),
      headers: { 'content-type': 'application/json' },
    },
    MUTATION_TIMEOUT_MS,
  );
  if (
    outcome.kind === 'envelope' &&
    outcome.envelope.ok &&
    outcome.envelope.data !== null
  ) {
    return { state: outcome.envelope.data, code: null, applied: true };
  }
  if (outcome.kind === 'envelope') {
    return {
      state: null,
      code: outcome.envelope.error?.code ?? 'worker_unavailable',
      applied: false,
    };
  }
  return { state: null, code: 'worker_unavailable', applied: false };
}

/**
 * Wave-5 launch-request review seams (gate #4 freeze consumed verbatim).
 *
 * REWIRE NOTE: the launchpad API does not exist yet (deploy-gate branch of
 * vault). Endpoint paths below are ASSUMED and documented so the rewire is
 * a path/shape confirmation, not a redesign:
 *   GET  /launch/requests              — review feed
 *   GET  /launch/requests/:id          — one request
 *   POST /launch/requests/:id/decision — HITL approve/reject (audited)
 *   GET  /health/launchpad             — factory health
 */

/**
 * Wave-5 stage guard. The launchpad routes do not exist until the
 * deploy-gate branch lands, and the live API answers unknown routes with an
 * envelope 404 (`code: 'http_error'`). That is NOT a launchpad domain error
 * — it means "endpoint not deployed yet" — so the launch seams treat it
 * exactly like an unreachable API and fall back to fixtures (mock badge).
 * Once deploy-gate lands, real envelope data flows through and genuine
 * launchpad error codes (e.g. launch_request_not_found) render honestly.
 */
function launchEndpointMissing(outcome: FetchOutcome<unknown>): boolean {
  return (
    outcome.kind === 'unreachable' ||
    (outcome.kind === 'envelope' &&
      outcome.envelope.error?.code === 'http_error')
  );
}

/** Wave 5: launch requests awaiting review (GET /launch/requests). */
export async function getLaunchRequests(): Promise<
  DataSource<LaunchRequest[]>
> {
  const outcome = await fetchEnvelope<LaunchRequest[]>('/launch/requests');
  if (launchEndpointMissing(outcome)) {
    return { data: MOCK_LAUNCH_REQUESTS, mock: true, apiError: null };
  }
  return toDataSource(outcome, MOCK_LAUNCH_REQUESTS);
}

/**
 * Wave 5: one launch request by id (GET /launch/requests/:id). Mirrors
 * getOrder: a live launchpad envelope error surfaces as `apiError` (the
 * detail page maps `launch_request_not_found` to its 404 and renders every
 * other code honestly); fixtures cover an unreachable API and the not-yet-
 * deployed launchpad routes (stage guard above).
 */
export async function getLaunchRequest(
  launchId: string,
): Promise<DataSource<LaunchRequest | null>> {
  const outcome = await fetchEnvelope<LaunchRequest>(
    `/launch/requests/${encodeURIComponent(launchId)}`,
  );
  if (launchEndpointMissing(outcome)) {
    return {
      data: MOCK_LAUNCH_REQUESTS.find((entry) => entry.id === launchId) ?? null,
      mock: true,
      apiError: null,
    };
  }
  if (outcome.kind === 'envelope') {
    if (outcome.envelope.ok && outcome.envelope.data !== null) {
      return { data: outcome.envelope.data, mock: false, apiError: null };
    }
    return { data: null, mock: false, apiError: outcome.envelope.error };
  }
  return { data: null, mock: false, apiError: null };
}

/** Outcome of a HITL launch decision attempt. */
export interface LaunchDecisionOutcome {
  /** Updated request — only present when the API confirmed the decision. */
  request: LaunchRequest | null;
  /** Envelope error code, or 'launchpad_unavailable' when unreachable. */
  code: string | null;
  /** True only when the API confirmed the decision. */
  applied: boolean;
}

/**
 * Wave-5 HITL mutation: POST /launch/requests/:id/decision with
 * `{ decision, reason }`. Like the kill switch there is NO fake-success
 * stub: a deploy approval that cannot reach the launchpad must report
 * failure honestly — safety-critical decisions never claim success. A
 * not-yet-deployed route (envelope `http_error`) is reported as
 * 'launchpad_unavailable', never as a recorded decision.
 */
export async function requestLaunchDecision(
  launchId: string,
  decision: 'approved' | 'rejected',
  reason: string,
): Promise<LaunchDecisionOutcome> {
  const outcome = await fetchEnvelope<LaunchRequest>(
    `/launch/requests/${encodeURIComponent(launchId)}/decision`,
    {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
      headers: { 'content-type': 'application/json' },
    },
    MUTATION_TIMEOUT_MS,
  );
  if (
    outcome.kind === 'envelope' &&
    outcome.envelope.ok &&
    outcome.envelope.data !== null
  ) {
    return { request: outcome.envelope.data, code: null, applied: true };
  }
  if (outcome.kind === 'envelope') {
    const code = outcome.envelope.error?.code;
    return {
      request: null,
      code:
        code === 'http_error' || code === undefined
          ? 'launchpad_unavailable'
          : code,
      applied: false,
    };
  }
  return { request: null, code: 'launchpad_unavailable', applied: false };
}

/** Wave 5: launch-factory health (GET /health/launchpad, assumed). */
export async function getFactoryHealth(): Promise<DataSource<FactoryHealth>> {
  const outcome = await fetchEnvelope<FactoryHealth>('/health/launchpad');
  if (launchEndpointMissing(outcome)) {
    return { data: MOCK_FACTORY_HEALTH, mock: true, apiError: null };
  }
  return toDataSource(outcome, MOCK_FACTORY_HEALTH);
}
