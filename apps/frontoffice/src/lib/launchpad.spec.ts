import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnvelope } from '@kryptr/shared-types';
import { API_PREFIX, API_URL } from '@/lib/api';
import { MOCK_LAUNCH_DRAFT } from '@/lib/fixtures';
import {
  LAUNCH_UNAVAILABLE_CODE,
  createApiLaunchpadSource,
  createStubConsentSource,
} from '@/lib/launchpad';

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function recordFetch(
  calls: FetchCall[],
  respond: (url: string) => Response,
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return respond(String(input));
    }),
  );
}

function envelopeResponse<T>(envelope: ApiEnvelope<T>): Response {
  return new Response(JSON.stringify(envelope), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('launchpad sources (endpoints not live yet — fail closed)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('targets the planned launchpad endpoints verbatim', async () => {
    const calls: FetchCall[] = [];
    recordFetch(calls, () =>
      envelopeResponse({
        ok: false,
        data: null,
        error: { code: 'not_found', message: '' },
      }),
    );
    const source = createApiLaunchpadSource();

    await source.draft('wallet-base-demo');
    await source.verification('t21:base:contracts/v1.0.0-demo');
    await source.consent(MOCK_LAUNCH_DRAFT);

    expect(calls.map((call) => call.url)).toEqual([
      `${API_URL}${API_PREFIX}/launchpad/wallets/wallet-base-demo/draft`,
      `${API_URL}${API_PREFIX}/launchpad/verification/${encodeURIComponent(
        't21:base:contracts/v1.0.0-demo',
      )}`,
      `${API_URL}${API_PREFIX}/launchpad/consent`,
    ]);
    expect(calls[0].init?.method).toBe('GET');
    expect(calls[1].init?.method).toBe('GET');
    expect(calls[2].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[2].init?.body))).toEqual(MOCK_LAUNCH_DRAFT);
  });

  it('answers network-error envelopes while the API is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const source = createApiLaunchpadSource();

    const draft = await source.draft('wallet-base-demo');

    expect(draft.ok).toBe(false);
    expect(draft.error?.code).toBe('network_error');
  });

  it('stub consent fails closed with the honest local code', async () => {
    const stub = createStubConsentSource();

    const result = await stub.consent(MOCK_LAUNCH_DRAFT);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe(LAUNCH_UNAVAILABLE_CODE);
    expect(result.error?.message).toContain('not wired');
  });
});
