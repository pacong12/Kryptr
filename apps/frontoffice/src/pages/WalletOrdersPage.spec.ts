import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import type {
  AgentWallet,
  ApiEnvelope,
  Order,
  OrderExecution,
  WalletBalance,
  WorkerHealth,
} from '@kryptr/shared-types';
import { err, ok } from '@kryptr/shared-types';
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

function makeExecution(
  overrides: Partial<OrderExecution> = {},
): OrderExecution {
  return {
    id: 'order-1:once',
    orderId: 'order-1',
    slotKey: 'once',
    intentId: null,
    status: 'confirmed',
    claimedAt: '2026-08-17T00:00:00.000Z',
    finishedAt: '2026-08-17T00:00:05.000Z',
    ...overrides,
  };
}

function workerHealth(isOk: boolean): WorkerHealth {
  return {
    component: 'order-worker',
    ok: isOk,
    ...(isOk
      ? {}
      : { detail: 'worker_unavailable (automation mode disabled)' }),
    checkedAt: '2026-08-16T12:00:00.000Z',
  };
}

/**
 * Fetch mock covering EVERY endpoint the page touches (wave-4 rewire):
 * wallets, balances, orders, worker health, executions and order creation.
 * The disabled-mode posture is the default: orders/health answer honest
 * envelopes, never fixtures masking live errors.
 */
function fetchMock(
  options: {
    orders?: ApiEnvelope<Order[]>;
    health?: ApiEnvelope<WorkerHealth>;
    executions?: ApiEnvelope<OrderExecution[]>;
    create?: ApiEnvelope<Order>;
  } = {},
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, init });
      let body: ApiEnvelope<unknown>;
      if (init?.method === 'POST' && url.endsWith('/orders')) {
        body =
          options.create ??
          ok<Order>(makeOrder({ id: 'order-new', status: 'pending_approval' }));
      } else if (url.includes('/orders/') && url.endsWith('/executions')) {
        body = options.executions ?? ok<OrderExecution[]>([makeExecution()]);
      } else if (url.endsWith('/orders')) {
        body = options.orders ?? ok<Order[]>([makeOrder()]);
      } else if (url.endsWith('/health/worker')) {
        body = options.health ?? ok<WorkerHealth>(workerHealth(true));
      } else if (url.includes(`/wallets/${WALLET_ID}/balances`)) {
        body = ok<WalletBalance[]>(balances);
      } else if (url.endsWith('/wallets')) {
        body = ok<AgentWallet[]>([wallet]);
      } else {
        body = {
          ok: false,
          data: null,
          error: { code: 'not_found', message: 'nope' },
        };
      }
      return {
        ok: body.ok,
        status: body.ok ? 200 : 503,
        text: async () => JSON.stringify(body),
      };
    },
  );
  return { impl, calls };
}

/** GET-style calls (apiGet sends an explicit method: 'GET'). */
function isGet(call: { init?: RequestInit }): boolean {
  return call.init?.method !== 'POST';
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

describe('WalletOrdersPage (rewired to the worker API)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  async function mountOrdersPage(mock: ReturnType<typeof fetchMock>) {
    vi.stubGlobal('fetch', mock.impl);
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
    return wrapper;
  }

  it('renders live orders, formatted amounts and no banner when healthy', async () => {
    const mock = fetchMock();
    const wrapper = await mountOrdersPage(mock);

    expect(wrapper.find('[data-testid="worker-health-banner"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-order-id="order-1"]').exists()).toBe(true);
    // #52 follow-up: the native base asset renders via real metadata,
    // never as a raw unit string.
    expect(wrapper.text()).toContain('0.5 ETH');
    expect(wrapper.text()).not.toContain('500000000000000000');
    expect(wrapper.text()).toContain('New order');
    wrapper.unmount();
  });

  it('keeps orders visible but stale-flagged while the worker is down', async () => {
    const mock = fetchMock({ health: ok(workerHealth(false)) });
    const wrapper = await mountOrdersPage(mock);

    const banner = wrapper.find('[data-testid="worker-health-banner"]');
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain('worker_unavailable');
    expect(wrapper.find('[data-testid="orders-stale-note"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-order-id="order-1"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('surfaces a list error envelope instead of fabricating an empty list', async () => {
    const mock = fetchMock({
      orders: err<Order[]>({
        code: 'worker_unavailable',
        message: 'automation disabled',
      }),
      health: ok(workerHealth(false)),
    });
    const wrapper = await mountOrdersPage(mock);

    const listError = wrapper.find('[data-testid="orders-load-error"]');
    expect(listError.exists()).toBe(true);
    expect(listError.text()).toContain('(code: worker_unavailable)');
    expect(wrapper.findAll('[data-order-id]')).toHaveLength(0);
    expect(wrapper.text()).not.toContain('No orders yet');
    // Creation is blocked while the worker is down.
    const create = buttonByText(wrapper.element, 'Create Limit order');
    expect(create?.disabled).toBe(true);
    wrapper.unmount();
  });

  it('rejects stop/twap with an explicit coded alert and a blocked submit', async () => {
    const mock = fetchMock();
    const wrapper = await mountOrdersPage(mock);

    await chooseItem(wrapper.element, '#order-type', 'Stop');
    await flushPromises();

    // Explicit rejection renders on selection — visible, coded, never hidden.
    const alert = wrapper.find('[data-testid="order-type-unsupported"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('(code: order_type_unsupported)');
    // Submit is blocked, so the unsupported type never reaches the worker.
    const create = buttonByText(wrapper.element, 'Create Stop order');
    expect(create?.disabled).toBe(true);
    expect(
      mock.calls.filter(
        (call) => call.init?.method === 'POST' && call.url.endsWith('/orders'),
      ),
    ).toHaveLength(0);
    wrapper.unmount();
  });

  it('shows human copy for a creation envelope code (kill_switch_active)', async () => {
    const mock = fetchMock({
      create: err<Order>({
        code: 'kill_switch_active',
        message: 'internal: kill switch mode cancel_active',
      }),
    });
    const wrapper = await mountOrdersPage(mock);

    await chooseItem(wrapper.element, '#order-quote-asset', 'USDC');
    await wrapper.find('#order-amount').setValue('0.5');
    await wrapper.find('#order-limit-price').setValue('3000');
    await flushPromises();
    const create = buttonByText(wrapper.element, 'Create Limit order');
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

  it('posts the raw-units request to the worker and refreshes the list', async () => {
    const mock = fetchMock();
    const wrapper = await mountOrdersPage(mock);

    await chooseItem(wrapper.element, '#order-quote-asset', 'USDC');
    await wrapper.find('#order-amount').setValue('0.5');
    await wrapper.find('#order-limit-price').setValue('3000');
    await flushPromises();
    const create = buttonByText(wrapper.element, 'Create Limit order');
    create!.dispatchEvent(new MouseEvent('click'));
    await flushPromises();

    const posts = mock.calls.filter(
      (call) => call.init?.method === 'POST' && call.url.endsWith('/orders'),
    );
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0]!.init?.body))).toEqual({
      walletId: WALLET_ID,
      type: 'limit',
      chain: 'base',
      baseAsset: null,
      quoteAsset: USDC,
      side: 'buy',
      amount: '500000000000000000',
      limitPrice: '3000',
      interval: null,
    });
    expect(wrapper.find('[data-testid="order-create-error"]').exists()).toBe(
      false,
    );
    // Successful creation re-reads the list endpoint.
    const listGets = mock.calls.filter(
      (call) => isGet(call) && call.url.endsWith('/orders'),
    );
    expect(listGets.length).toBeGreaterThanOrEqual(2);
    wrapper.unmount();
  });

  it('shows the executions ledger when a row is expanded', async () => {
    const mock = fetchMock();
    const wrapper = await mountOrdersPage(mock);

    await wrapper
      .find('button[aria-label^="Show executions"]')
      .trigger('click');
    await flushPromises();

    expect(
      mock.calls.some((call) =>
        call.url.endsWith('/orders/order-1/executions'),
      ),
    ).toBe(true);
    const panel = wrapper.find('[data-testid="order-executions-panel"]');
    expect(panel.exists()).toBe(true);
    expect(panel.text()).toContain('slot once');
    expect(panel.find('[data-execution-status="confirmed"]').exists()).toBe(
      true,
    );
    // Honest boundary copy: nothing is broadcast yet (stage C).
    expect(panel.text()).toContain('nothing is broadcast on-chain yet');
    wrapper.unmount();
  });

  it('renders an honest executions error instead of a fabricated ledger', async () => {
    const mock = fetchMock({
      executions: err<OrderExecution[]>({
        code: 'worker_unavailable',
        message: 'down',
      }),
    });
    const wrapper = await mountOrdersPage(mock);

    await wrapper
      .find('button[aria-label^="Show executions"]')
      .trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="executions-load-error"]').exists()).toBe(
      true,
    );
    expect(wrapper.text()).toContain('worker_unavailable');
    wrapper.unmount();
  });
});
