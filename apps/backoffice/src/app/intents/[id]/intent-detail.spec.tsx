import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Render helper for async server components. */
function envelope(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(impl: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => impl(String(input))));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cleanup();
});

const MOCK_INTENT = {
  id: 'int_w7_test_1',
  walletId: 'wal_base_treasury',
  chain: 'base',
  kind: 'transfer',
  to: '0x9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d',
  asset: null,
  amount: '250000000000000000',
  origin: 'agent:face',
  createdAt: '2026-08-18T10:00:00.000Z',
  status: 'pending_approval',
};

const MOCK_SIGN_REQUEST = {
  id: 'sr_test_001',
  intentId: 'int_w7_test_1',
  status: 'pending',
  unsignedTx: {
    to: '0xdeadbeef1234567890abcdef1234567890abcdef',
    value: '0x3782dace9d9000',
    data: '0xa9059cbb0000000000000000000000009e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d0000000000000000000000000000000000000000000000003635c9adc5dea00000',
  },
  digest: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  note: 'Pending external signer decision',
  createdAt: '2026-08-18T09:55:00.000Z',
};

describe('IntentDetailPage W7-M5', () => {
  it('shows SignRequest via API mock', async () => {
    stubFetch((url: string) => {
      if (url.includes(`/signing/${MOCK_INTENT.id}`)) {
        return envelope({ ok: true, data: MOCK_SIGN_REQUEST, error: null });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const module = await import('@/lib/api');
    const result = await module.getSignRequest(MOCK_INTENT.id);
    
    expect(result.data).toEqual(MOCK_SIGN_REQUEST);
    expect(result.mock).toBe(false);
  });

  it('handles unreachable API gracefully', async () => {
    stubFetch(() => {
      throw new Error('ECONNREFUSED');
    });

    const module = await import('@/lib/api');
    const result = await module.getSignRequest(MOCK_INTENT.id);
    
    expect(result.data).toBeNull();
    expect(result.mock).toBe(true);
  });

  it('displays UnsignedTxPreview with truncated values', async () => {
    const { UnsignedTxPreview } = await import('@/components/unsigned-tx-preview');
    
    render(<UnsignedTxPreview unsignedTx={MOCK_SIGN_REQUEST.unsignedTx} />);
    
    // shortenHex truncates to first 6 chars + … + last 4 chars
    expect(screen.getByText(/0xdead/)).toBeInTheDocument();
    expect(screen.getByText('0x3782dace9d9000')).toBeInTheDocument();
    expect(screen.getByText(/0xa905/i)).toBeInTheDocument();
  });
});
