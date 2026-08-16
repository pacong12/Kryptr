import type {
  AgentWallet,
  ApiEnvelope,
  ApiError,
  FeedHealth,
  HealthStatus,
  IntentTimelineStep,
  SecurityDecision,
  SwapQuote,
} from '@kryptr/shared-types';

import {
  MOCK_FEEDS,
  MOCK_INTENTS,
  MOCK_QUOTES,
  MOCK_TIMELINES,
  MOCK_WALLETS,
  type IntentWithStatus,
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
): Promise<FetchOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${API_PREFIX}${path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
