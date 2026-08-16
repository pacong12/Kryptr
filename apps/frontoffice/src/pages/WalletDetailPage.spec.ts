import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import type {
  AgentWallet,
  SecurityDecision,
  WalletBalance,
} from '@kryptr/shared-types';
import App from '@/app/App.vue';
import { createAppRouter } from '@/router';

const WALLET_ID = 'wallet-base-demo';

const wallet: AgentWallet = {
  id: WALLET_ID,
  address: '0xA1b2C3d4E5f60718293A4B5c6D7e8F9012345678',
  ownerId: 'demo-user',
  chains: ['base'],
  createdAt: '2026-08-01T09:30:00.000Z',
  lastKeyRotationAt: null,
};

const balances: WalletBalance[] = [
  {
    walletId: WALLET_ID,
    chain: 'base',
    nativeBalance: '1250000000000000000',
    tokens: [
      {
        contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        symbol: 'USDC',
        decimals: 6,
        amount: '1250500000',
      },
    ],
  },
];

const decision: SecurityDecision = {
  intentId: 'intent-123',
  result: 'approved',
  reason: 'Within policy limits.',
  decidedAt: '2026-08-16T00:00:00.000Z',
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  };
}

function fetchMock() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/security/evaluate')) {
      return jsonResponse({ ok: true, data: decision, error: null });
    }
    if (url.includes(`/wallets/${WALLET_ID}/balances`)) {
      return jsonResponse({ ok: true, data: balances, error: null });
    }
    if (url.endsWith('/wallets')) {
      return jsonResponse({ ok: true, data: [wallet], error: null });
    }
    return jsonResponse(
      { ok: false, data: null, error: { code: 'not_found', message: 'nope' } },
      false,
      404,
    );
  });
}

describe('Wallet overview tab (transfer through the security gate)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function mountPage() {
    const router = createAppRouter(createMemoryHistory());
    await router.push({
      name: 'wallet-detail',
      params: { walletId: WALLET_ID },
    });
    await router.isReady();
    const wrapper = mount(App, {
      global: { plugins: [router] },
    });
    await flushPromises();
    return { wrapper, router };
  }

  it('renders the balance table with formatted native and token rows', async () => {
    const { wrapper } = await mountPage();

    const text = wrapper.text();
    expect(text).toContain('Balances');
    expect(text).toContain('1.25'); // 1.25 ETH native
    expect(text).toContain('USDC');
    expect(text).toContain('1250.5'); // 1250.5 USDC
    expect(text).toContain('Base');
  });

  it('posts a transfer intent and renders the security decision', async () => {
    const { wrapper } = await mountPage();

    await wrapper
      .find('#transfer-to')
      .setValue('0x0000000000000000000000000000000000000001');
    await wrapper.find('#transfer-amount').setValue('0.5');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    const evaluateCall = (
      globalThis.fetch as ReturnType<typeof vi.fn>
    ).mock.calls.find((call) => String(call[0]).includes('/security/evaluate'));
    expect(evaluateCall).toBeTruthy();

    const text = wrapper.text();
    expect(text).toContain('Security decision');
    expect(text).toContain('Approved');
    expect(text).toContain('Within policy limits.');
  });

  it('shows a validation error and does not call the gate for a bad address', async () => {
    const { wrapper } = await mountPage();

    await wrapper.find('#transfer-to').setValue('not-an-address');
    await wrapper.find('#transfer-amount').setValue('0.5');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.text()).toContain('valid recipient address');
    const evaluateCall = (
      globalThis.fetch as ReturnType<typeof vi.fn>
    ).mock.calls.find((call) => String(call[0]).includes('/security/evaluate'));
    expect(evaluateCall).toBeUndefined();
  });
});
