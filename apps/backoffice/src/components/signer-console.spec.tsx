import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SigningConsoleSection } from './signing-console-section';

/** Render helper for async server components. */
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

const SIGN_REQUEST = {
  id: 'sr_test_1',
  intentId: 'int_abc123',
  status: 'pending',
  unsignedTx: { to: '0xdeadbeef', data: '0x', value: '0x0' },
  digest: '0xdeadbeef1234567890abcdefdeadbeef1234567890abcdefdeadbeef12345678',
  note: 'Pending external signer decision',
  createdAt: '2026-08-17T10:00:00.000Z',
};

describe('SigningConsoleSection', () => {
  it('shows intentId for each sign request', async () => {
    stubFetch(() =>
      envelope({ ok: true, data: [SIGN_REQUEST], error: null }),
    );

    render(await SigningConsoleSection());

    expect(screen.getByText('int_abc123')).toBeInTheDocument();
  });

  it('shows status badge', async () => {
    stubFetch(() =>
      envelope({ ok: true, data: [SIGN_REQUEST], error: null }),
    );

    render(await SigningConsoleSection());

    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('shows digest truncated to 10 chars + ellipsis', async () => {
    stubFetch(() =>
      envelope({ ok: true, data: [SIGN_REQUEST], error: null }),
    );

    render(await SigningConsoleSection());

    // digest slice(0,10) = '0xdeadbeef' (10 chars) then '…'
    expect(screen.getByTestId('digest')).toHaveTextContent('0xdeadbeef…');
  });

  it('shows multiple requests', async () => {
    const req2 = { ...SIGN_REQUEST, id: 'sr_test_2', intentId: 'int_xyz999', status: 'dry_run' };
    stubFetch(() =>
      envelope({ ok: true, data: [SIGN_REQUEST, req2], error: null }),
    );

    render(await SigningConsoleSection());

    expect(screen.getByText('int_abc123')).toBeInTheDocument();
    expect(screen.getByText('int_xyz999')).toBeInTheDocument();
    expect(screen.getByText('dry_run')).toBeInTheDocument();
  });

  it('shows empty state when no requests', async () => {
    stubFetch(() => envelope({ ok: true, data: [], error: null }));

    render(await SigningConsoleSection());

    expect(screen.getByText(/No sign requests found/)).toBeInTheDocument();
  });

  it('falls back to fixtures with mock badge when API unreachable', async () => {
    stubFetch(() => { throw new Error('ECONNREFUSED'); });

    render(await SigningConsoleSection());

    // MOCK_SIGN_REQUESTS fixture has intentId 'int_9f3a'
    expect(screen.getByText('int_9f3a')).toBeInTheDocument();
    expect(screen.getByText(/mock data/i)).toBeInTheDocument();
  });

  it('shows N/A digest when digest is null', async () => {
    const nullDigestReq = { ...SIGN_REQUEST, digest: null };
    stubFetch(() =>
      envelope({ ok: true, data: [nullDigestReq], error: null }),
    );

    render(await SigningConsoleSection());

    expect(screen.getByTestId('digest')).toHaveTextContent('N/A');
  });
});
