import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import type {
  AgentWallet,
  Order,
  WalletBalance,
  WorkerHealth,
} from '@kryptr/shared-types';
import { err, ok } from '@kryptr/shared-types';
import App from '@/app/App.vue';
import { createAppRouter } from '@/router';
import { ORDERS_SOURCE_KEY, type OrdersSource } from '@/lib/orders';

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

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, text: async () => JSON.stringify(body) };
}

/**
 * The order-worker source is a fail-closed STUB (no endpoint contract on
 * main yet), so orders/health never hit the network; only wallets and
 * balances fetch. Anything unexpected answers as a 404 envelope.
 */
function fetchMock(options: { wallets?: AgentWallet[] } = {}) {
  const wallets = options.wallets ?? [wallet];
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes(`/wallets/${WALLET_ID}/balances`)) {
      return jsonResponse({ ok: true, data: balances, error: null });
    }
    if (url.endsWith('/wallets')) {
      return jsonResponse({ ok: true, data: wallets, error: null });
    }
    return jsonResponse(
      { ok: false, data: null, error: { code: 'not_found', message: 'nope' } },
      false,
      404,
    );
  });
}

// jsdom lacks the pointer-capture APIs reka-ui's Select relies on.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

async function openSelect(root: ParentNode, selector: string): Promise<void> {
  const trigger = root.querySelector(selector);
  if (!trigger) throw new Error(`select trigger ${selector} not found`);
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'button', { value: 0 });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  trigger.dispatchEvent(event);
  await flushPromises();
}

/** reka-ui portals open select content to document.body. */
function selectItems(): HTMLElement[] {
  return [
    ...document.body.querySelectorAll<HTMLElement>('[data-slot="select-item"]'),
  ];
}

async function chooseItem(root: ParentNode, selector: string, text: string) {
  await openSelect(root, selector);
  const item = selectItems().find((candidate) =>
    (candidate.textContent ?? '').includes(text),
  );
  if (!item) throw new Error(`select item '${text}' not found`);
  item.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  item.click();
  await flushPromises();
}

function buttonByText(root: ParentNode, text: string) {
  return [...root.querySelectorAll('button')].find((button) =>
    (button.textContent ?? '').includes(text),
  );
}

describe('WalletOrdersPage (worker-down degradation, fail-closed creation)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  async function mountOrdersPage(
    fetchImpl: ReturnType<typeof fetchMock>,
    source?: OrdersSource,
  ) {
    vi.stubGlobal('fetch', fetchImpl);
    const router = createAppRouter(createMemoryHistory());
    await router.push({
      name: 'wallet-orders',
      params: { walletId: WALLET_ID },
    });
    await router.isReady();
    const wrapper = mount(App, {
      global: {
        plugins: [router],
        ...(source ? { provide: { [ORDERS_SOURCE_KEY]: source } } : {}),
      },
      attachTo: document.body,
    });
    await flushPromises();
    return wrapper;
  }

  function makeOrder(overrides: Partial<Order> = {}): Order {
    return {
      id: 'order-1',
      walletId: WALLET_ID,
      type: 'limit',
      status: 'open',
      chain: 'base',
      baseAsset: null,
      quoteAsset: USDC,
      side: 'buy',
      amount: '500000000000000000',
      limitPrice: '3000',
      interval: null,
      createdAt: '2026-08-16T00:00:00.000Z',
      ...overrides,
    };
  }

  function healthySource(overrides: Partial<OrdersSource> = {}): OrdersSource {
    return {
      list: async () => ok<Order[]>([makeOrder()]),
      health: async () =>
        ok<WorkerHealth>({
          component: 'order-worker',
          ok: true,
          checkedAt: '2026-08-16T00:00:00.000Z',
        }),
      create: async () =>
        ok<Order>(makeOrder({ id: 'order-new', status: 'pending_approval' })),
      ...overrides,
    };
  }

  it('shows the worker-down banner and an honest list error — nothing fabricated', async () => {
    const wrapper = await mountOrdersPage(fetchMock());

    // Degradation banner (wave-3 feed-health style).
    const banner = wrapper.find('[data-testid="worker-health-banner"]');
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain('Order worker unavailable');
    expect(banner.text()).toContain('worker_unavailable');

    // List failed closed with human copy + code; no fake rows.
    const listError = wrapper.find('[data-testid="orders-load-error"]');
    expect(listError.exists()).toBe(true);
    expect(listError.text()).toContain('Order worker unavailable');
    expect(listError.text()).toContain('(code: worker_unavailable)');
    expect(wrapper.findAll('[data-order-id]')).toHaveLength(0);
    expect(wrapper.text()).not.toContain('No orders yet');

    // Creation is blocked while the worker is down.
    const create = buttonByText(wrapper.element, 'Create Limit order');
    expect(create?.disabled).toBe(true);
    wrapper.unmount();
  });

  it('renders live orders with lifecycle badges when the source answers (no banner)', async () => {
    const source = healthySource({
      list: async () =>
        ok<Order[]>([
          makeOrder(),
          makeOrder({
            id: 'order-2',
            type: 'dca',
            status: 'partially_filled',
            limitPrice: null,
            interval: 'P1D',
          }),
          makeOrder({ id: 'order-3', status: 'failed' }),
        ]),
    });
    const wrapper = await mountOrdersPage(fetchMock(), source);

    expect(wrapper.find('[data-testid="worker-health-banner"]').exists()).toBe(
      false,
    );
    expect(wrapper.findAll('[data-order-id]')).toHaveLength(3);
    expect(wrapper.find('[data-status="open"]').exists()).toBe(true);
    expect(wrapper.find('[data-status="partially_filled"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-status="failed"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows human copy for a creation envelope code (kill_switch_active)', async () => {
    const source = healthySource({
      create: async () =>
        err<Order>({
          code: 'kill_switch_active',
          message: 'internal: kill switch mode cancel_active',
        }),
    });
    const wrapper = await mountOrdersPage(fetchMock(), source);

    // Healthy worker: creation is allowed; fill a valid limit order.
    await chooseItem(wrapper.element, '#order-quote-asset', 'USDC');
    await wrapper.find('#order-amount').setValue('0.5');
    await wrapper.find('#order-limit-price').setValue('3000');
    await flushPromises();
    const create = buttonByText(wrapper.element, 'Create Limit order');
    expect(create?.disabled).toBe(false);
    create!.dispatchEvent(new MouseEvent('click'));
    await flushPromises();

    const alert = wrapper.find('[data-testid="order-create-error"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('Kill switch active');
    expect(alert.text()).toContain('(code: kill_switch_active)');
    // No raw internals leak through the human map.
    expect(alert.text()).not.toContain('internal:');
    wrapper.unmount();
  });

  it('refreshes the list after a successful creation', async () => {
    let listCalls = 0;
    const source = healthySource({
      list: async () => {
        listCalls += 1;
        return ok<Order[]>([makeOrder()]);
      },
    });
    const wrapper = await mountOrdersPage(fetchMock(), source);
    expect(listCalls).toBe(1);

    await chooseItem(wrapper.element, '#order-quote-asset', 'USDC');
    await wrapper.find('#order-amount').setValue('0.5');
    await wrapper.find('#order-limit-price').setValue('3000');
    await flushPromises();
    buttonByText(wrapper.element, 'Create Limit order')!.dispatchEvent(
      new MouseEvent('click'),
    );
    await flushPromises();

    expect(listCalls).toBe(2);
    wrapper.unmount();
  });

  it('shows wallet-not-found for an unknown wallet id', async () => {
    vi.stubGlobal('fetch', fetchMock({ wallets: [] }));
    const router = createAppRouter(createMemoryHistory());
    await router.push({
      name: 'wallet-orders',
      params: { walletId: WALLET_ID },
    });
    await router.isReady();
    const wrapper = mount(App, {
      global: { plugins: [router] },
      attachTo: document.body,
    });
    await flushPromises();

    expect(
      wrapper.find('[data-testid="orders-wallet-not-found"]').exists(),
    ).toBe(true);
    wrapper.unmount();
  });
});
