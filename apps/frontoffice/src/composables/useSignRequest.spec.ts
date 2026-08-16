import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import type { SignRequest } from '@kryptr/shared-types';
import { useSignRequest } from './useSignRequest';

const signRequest: SignRequest = {
  id: 'sign-request-1',
  intentId: 'intent-1',
  status: 'dry_run',
  unsignedTx: {
    to: '0x1111111111111111111111111111111111111111',
    data: '0xdeadbeef',
    value: '0x0',
  },
  digest: '0xabc123',
  note: 'dry-run only — nothing broadcast',
  createdAt: '2026-08-20T00:00:01.000Z',
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, text: async () => JSON.stringify(body) };
}

describe('useSignRequest (dry-run display only)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mountComposable() {
    const scope = effectScope();
    const api = scope.run(() => useSignRequest());
    if (!api) throw new Error('composable failed to mount');
    return { api, stop: () => scope.stop() };
  }

  it('prepares the dry-run request for an approved intent', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) =>
      jsonResponse({ ok: true, data: signRequest, error: null }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { api, stop } = mountComposable();

    await api.request('intent-1');

    expect(api.signRequest.value?.status).toBe('dry_run');
    expect(api.signRequest.value?.note).toBe(
      'dry-run only — nothing broadcast',
    );
    expect(api.error.value).toBeNull();
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/security/intents/intent-1/sign-request',
    );
    stop();
  });

  it('fails closed when the signer endpoint is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    const { api, stop } = mountComposable();

    await api.request('intent-1');

    expect(api.signRequest.value).toBeNull();
    expect(api.error.value?.code).toBe('network_error');
    stop();
  });

  it('fails closed on an error envelope (e.g. intent not approved)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            ok: false,
            data: null,
            error: { code: 'intent_not_approved', message: 'Not approved.' },
          },
          false,
          409,
        ),
      ),
    );
    const { api, stop } = mountComposable();

    await api.request('intent-1');

    expect(api.signRequest.value).toBeNull();
    expect(api.error.value?.code).toBe('intent_not_approved');
    stop();
  });

  it('reset() drops a stale request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ ok: true, data: signRequest, error: null }),
      ),
    );
    const { api, stop } = mountComposable();

    await api.request('intent-1');
    expect(api.signRequest.value).not.toBeNull();

    api.reset();

    expect(api.signRequest.value).toBeNull();
    expect(api.error.value).toBeNull();
    stop();
  });
});
