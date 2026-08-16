import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExecutionTimeline } from './execution-timeline';

/**
 * Wave-4 rewire follow-up #2: a LIVE envelope error on
 * GET /api/orders/:id/executions must render an honest "executions
 * unavailable" state — never the fixture and never a misleading
 * "no executions yet". Fixtures only cover an unreachable API.
 *
 * ExecutionTimeline is an async server component (plain async function), so
 * we await it directly and render the returned element. `fetch` is stubbed
 * to control the envelope precisely; no real network.
 */

function envelope(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(impl: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => impl(String(input))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cleanup();
});

describe('ExecutionTimeline (rewire: honest error)', () => {
  it('renders an honest unavailable state on a live envelope error', async () => {
    stubFetch(() =>
      envelope({
        ok: false,
        data: null,
        error: {
          code: 'worker_unavailable',
          message: 'automation is disabled',
        },
      }),
    );

    render(await ExecutionTimeline({ orderId: 'ord_any' }));

    expect(
      screen.getByText(/Executions unavailable — automation is disabled/),
    ).toBeInTheDocument();
    // Neither the fixture timeline nor the misleading empty copy renders.
    expect(screen.queryByText(/No executions yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/mock data/i)).not.toBeInTheDocument();
  });

  it('renders the empty state when the live API returns zero executions', async () => {
    stubFetch(() => envelope({ ok: true, data: [], error: null }));

    render(await ExecutionTimeline({ orderId: 'ord_any' }));

    expect(screen.getByText(/No executions yet/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Executions unavailable/),
    ).not.toBeInTheDocument();
  });

  it('renders live execution rows with a stable execution.id key', async () => {
    stubFetch(() =>
      envelope({
        ok: true,
        data: [
          {
            id: 'ord_any:once',
            orderId: 'ord_any',
            slotKey: 'once',
            intentId: null,
            status: 'confirmed',
            claimedAt: '2026-08-17T09:00:05.000Z',
            finishedAt: '2026-08-17T09:00:28.000Z',
            detail:
              'gate approved; unsigned execution ready (dry-run boundary)',
          },
        ],
        error: null,
      }),
    );

    render(await ExecutionTimeline({ orderId: 'ord_any' }));

    expect(screen.getByText('confirmed')).toBeInTheDocument();
    expect(screen.getByText(/dry-run boundary/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Executions unavailable/),
    ).not.toBeInTheDocument();
  });

  it('falls back to fixtures (mock badge) only when the API is unreachable', async () => {
    stubFetch(() => {
      throw new Error('ECONNREFUSED');
    });

    // ord_limit_fill has a confirmed fixture execution.
    render(await ExecutionTimeline({ orderId: 'ord_limit_fill' }));

    expect(screen.getByText('confirmed')).toBeInTheDocument();
    expect(screen.getByText(/mock data/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Executions unavailable/),
    ).not.toBeInTheDocument();
  });
});
