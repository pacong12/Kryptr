import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import type {
  AgentWallet,
  SecurityDecision,
  SignRequest,
  SwapQuote,
  WalletBalance,
} from '@kryptr/shared-types';
import App from '@/app/App.vue';
import { createAppRouter } from '@/router';

const WALLET_ID = 'wallet-base-demo';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

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
    nativeBalance: '1500000000000000000',
    tokens: [
      {
        contractAddress: USDC,
        symbol: 'USDC',
        decimals: 6,
        amount: '2500000000',
      },
    ],
  },
];

function makeQuote(overrides: Partial<SwapQuote> = {}): SwapQuote {
  return {
    id: 'quote-1',
    source: 'static-mock',
    chain: 'base',
    assetIn: null,
    assetOut: USDC,
    amountIn: '500000000000000000',
    amountOut: '1500000000',
    price: 3000,
    minAmountOut: '1485000000',
    slippageBps: 100,
    route: [],
    fetchedAt: '2026-08-16T00:00:00.000Z',
    expiresAt: '2026-08-16T00:00:30.000Z',
    ...overrides,
  };
}

function makeDecision(
  overrides: Partial<SecurityDecision> = {},
): SecurityDecision {
  return {
    intentId: 'intent-1',
    result: 'approved',
    reason: 'approved: within policy',
    decidedAt: '2026-08-16T00:00:01.000Z',
    ...overrides,
  };
}

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

interface FetchOptions {
  quote?: SwapQuote;
  quoteEnvelope?: { ok: boolean; error: { code: string; message: string } };
  decision?: SecurityDecision;
}

function fetchMock(options: FetchOptions = {}) {
  const { quote = makeQuote(), decision = makeDecision() } = options;
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/sign-request')) {
      return jsonResponse({ ok: true, data: signRequest, error: null });
    }
    if (url.includes('/security/evaluate')) {
      return jsonResponse({ ok: true, data: decision, error: null });
    }
    if (url.includes('/quotes')) {
      if (options.quoteEnvelope) {
        return jsonResponse(
          { ok: false, data: null, error: options.quoteEnvelope.error },
          false,
          502,
        );
      }
      return jsonResponse({ ok: true, data: quote, error: null });
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

function buttonByText(root: ParentNode, text: string) {
  return [...root.querySelectorAll('button')].find((button) =>
    (button.textContent ?? '').includes(text),
  );
}

describe('SwapPage (quote → review → gate decision)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  async function mountSwapPage(fetchImpl: ReturnType<typeof fetchMock>) {
    vi.stubGlobal('fetch', fetchImpl);
    const router = createAppRouter(createMemoryHistory());
    await router.push({ name: 'wallet-swap', params: { walletId: WALLET_ID } });
    await router.isReady();
    const wrapper = mount(App, {
      global: { plugins: [router] },
      attachTo: document.body,
    });
    await flushPromises();
    return { wrapper, router };
  }

  /** Type an amount and let the debounced auto-quote fire. */
  async function requestQuote(wrapper: ReturnType<typeof mount>) {
    await wrapper.find('#swap-amount').setValue('0.5');
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
  }

  it('happy path: quotes, reviews in the dialog, and ends approved — ready to sign', async () => {
    const fetchImpl = fetchMock();
    const { wrapper } = await mountSwapPage(fetchImpl);

    await requestQuote(wrapper);

    // The live quote renders with its expiry countdown.
    expect(wrapper.text()).toContain('You receive (expected)');
    expect(wrapper.text()).toContain('1500 USDC');
    expect(wrapper.text()).toMatch(/Expires in (29|30)s/);

    // Open the review dialog (teleported to body) and confirm.
    await buttonByText(wrapper.element, 'Review swap')!.dispatchEvent(
      new MouseEvent('click'),
    );
    await flushPromises();
    const confirm = buttonByText(
      document.body,
      'Confirm — send to security gate',
    );
    expect(confirm).toBeTruthy();
    confirm!.dispatchEvent(new MouseEvent('click'));
    await flushPromises();

    // The gate decision renders the approved result state.
    expect(wrapper.text()).toContain('Approved — ready to sign');
    expect(wrapper.text()).toContain('approved: within policy');

    // The submitted intent is quote-bound.
    const evaluateCall = fetchImpl.mock.calls.find((call) =>
      String(call[0]).includes('/security/evaluate'),
    );
    expect(evaluateCall).toBeTruthy();
    const body = JSON.parse(String(evaluateCall![1]?.body));
    expect(body.kind).toBe('swap');
    expect(body.swap.quoteId).toBe('quote-1');
    expect(body.swap.minBuyAmount).toBe('1485000000');
    wrapper.unmount();
  });

  it('shows the rejection reason and an adjust-amount affordance', async () => {
    const fetchImpl = fetchMock({
      decision: makeDecision({
        result: 'rejected',
        reason: 'rejected: value exceeds approval threshold',
      }),
    });
    const { wrapper } = await mountSwapPage(fetchImpl);

    await requestQuote(wrapper);
    await buttonByText(wrapper.element, 'Review swap')!.dispatchEvent(
      new MouseEvent('click'),
    );
    await flushPromises();
    buttonByText(
      document.body,
      'Confirm — send to security gate',
    )!.dispatchEvent(new MouseEvent('click'));
    await flushPromises();

    expect(wrapper.text()).toContain('Rejected — nothing will be signed');
    expect(wrapper.text()).toContain(
      'rejected: value exceeds approval threshold',
    );
    expect(buttonByText(wrapper.element, 'Adjust amount')).toBeTruthy();
    wrapper.unmount();
  });

  it('expired quote: blocks review and offers a fresh quote', async () => {
    const fetchImpl = fetchMock({
      quote: makeQuote({ expiresAt: '2026-08-15T23:59:59.000Z' }),
    });
    const { wrapper } = await mountSwapPage(fetchImpl);

    await requestQuote(wrapper);

    expect(wrapper.text()).toContain('Quote expired');
    expect(wrapper.text()).toContain('Get a fresh quote');
    const reviewButton = buttonByText(wrapper.element, 'Review swap');
    expect(reviewButton).toBeTruthy();
    expect((reviewButton as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it('aggregator failure shows an inline error and never invents a quote', async () => {
    const fetchImpl = fetchMock({
      quoteEnvelope: {
        ok: false,
        error: {
          code: 'aggregator_unavailable',
          message: 'No aggregator could price this pair.',
        },
      },
    });
    const { wrapper } = await mountSwapPage(fetchImpl);

    await requestQuote(wrapper);

    expect(wrapper.text()).toContain('No quote available');
    expect(wrapper.text()).toContain('No aggregator could price this pair.');
    expect(wrapper.text()).not.toContain('You receive (expected)');
    // Transient failure keeps the retry affordance.
    expect(buttonByText(wrapper.element, 'Retry quote')).toBeTruthy();
    wrapper.unmount();
  });

  it('unconfigured aggregator: informational copy, never a retry tease', async () => {
    const fetchImpl = fetchMock({
      quoteEnvelope: {
        ok: false,
        error: {
          code: 'aggregator_unconfigured',
          message: 'No aggregator configured.',
        },
      },
    });
    const { wrapper } = await mountSwapPage(fetchImpl);

    await requestQuote(wrapper);

    expect(wrapper.text()).toContain('Live quotes not available');
    expect(wrapper.text()).toContain('no swap aggregator configured');
    expect(wrapper.text()).not.toContain('Retry quote');
    expect(wrapper.text()).not.toContain('You receive (expected)');
    wrapper.unmount();
  });

  it('approved swap can prepare a labeled dry-run signature', async () => {
    const fetchImpl = fetchMock();
    const { wrapper } = await mountSwapPage(fetchImpl);

    await requestQuote(wrapper);
    await buttonByText(wrapper.element, 'Review swap')!.dispatchEvent(
      new MouseEvent('click'),
    );
    await flushPromises();
    buttonByText(
      document.body,
      'Confirm — send to security gate',
    )!.dispatchEvent(new MouseEvent('click'));
    await flushPromises();

    expect(wrapper.text()).toContain('Approved — ready to sign');

    // Dry-run is user-triggered and clearly labeled.
    buttonByText(wrapper.element, 'Dry-run sign')!.dispatchEvent(
      new MouseEvent('click'),
    );
    await flushPromises();

    expect(wrapper.text()).toContain('Dry-run signature — nothing broadcast');
    expect(wrapper.text()).toContain('status: dry_run');
    expect(wrapper.text()).toContain('dry-run only — nothing broadcast');
    expect(wrapper.text()).toContain('0xabc123');
    const signCall = fetchImpl.mock.calls.find((call) =>
      String(call[0]).includes('/sign-request'),
    );
    expect(String(signCall![0])).toContain(
      '/security/intents/intent-1/sign-request',
    );
    wrapper.unmount();
  });
});
