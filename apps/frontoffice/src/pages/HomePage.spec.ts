import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import type { WorkerHealth } from '@kryptr/shared-types';
import { err, ok } from '@kryptr/shared-types';
import HomePage from './HomePage.vue';
import { MOCK_WALLETS } from '@/lib/fixtures';
import { shortAddress } from '@/lib/format';
import { ORDERS_SOURCE_KEY, type OrdersSource } from '@/lib/orders';
import { createAppRouter } from '@/router';

function buttonByText(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper
    .findAll('button')
    .find((button) => button.text().includes(text));
}

function workerSource(health: WorkerHealth): OrdersSource {
  return {
    list: async () => err({ code: 'worker_unavailable', message: '' }),
    health: async () => ok(health),
    create: async () => err({ code: 'worker_unavailable', message: '' }),
  };
}

describe('HomePage (graceful mock mode)', () => {
  beforeEach(() => {
    // Simulate an unreachable API: fetch rejects on every call.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function mountHomePage(source?: OrdersSource) {
    const router = createAppRouter(createMemoryHistory());
    router.push('/');
    await router.isReady();
    const wrapper = mount(HomePage, {
      global: {
        plugins: [router],
        ...(source ? { provide: { [ORDERS_SOURCE_KEY]: source } } : {}),
      },
    });
    await flushPromises();
    return { wrapper, router };
  }

  it('falls back to fixture wallets and shows a mock-data badge', async () => {
    const { wrapper } = await mountHomePage();

    const connectButton = buttonByText(wrapper, 'Connect Wallet');
    expect(connectButton).toBeTruthy();
    await connectButton!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('mock data');
    expect(wrapper.text()).toContain('Your wallets');
    for (const wallet of MOCK_WALLETS) {
      expect(wrapper.text()).toContain(shortAddress(wallet.address));
    }
  });

  it('navigates to the wallet detail route when a wallet is opened', async () => {
    const { wrapper, router } = await mountHomePage();

    await buttonByText(wrapper, 'Connect Wallet')!.trigger('click');
    await flushPromises();

    const viewButton = buttonByText(wrapper, 'View balances');
    expect(viewButton).toBeTruthy();
    await viewButton!.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('wallet-detail');
    expect(router.currentRoute.value.params.walletId).toBe(MOCK_WALLETS[0].id);
  });
});

describe('HomePage (honest landing: current state, no overclaims)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function mountHomePage(source?: OrdersSource) {
    const router = createAppRouter(createMemoryHistory());
    router.push('/');
    await router.isReady();
    const wrapper = mount(HomePage, {
      global: {
        plugins: [router],
        ...(source ? { provide: { [ORDERS_SOURCE_KEY]: source } } : {}),
      },
    });
    await flushPromises();
    return { wrapper, router };
  }

  it('shows the Phase 1 hero and no internal wave claims or kept promises', async () => {
    const { wrapper } = await mountHomePage();

    expect(wrapper.text()).toContain('Phase 1 · Base');
    expect(wrapper.text()).toContain(
      'Security-gated finance for autonomous agents',
    );
    // Internal wave numbering and unkept wave-2 promises are gone.
    expect(wrapper.text()).not.toContain('Wave 1');
    expect(wrapper.text()).not.toContain('lands in Wave 2');
    expect(wrapper.text()).toContain('Kryptr never fabricates data');
  });

  it('shows honest status chips: API mock fallback + worker unavailable', async () => {
    const { wrapper } = await mountHomePage();

    const apiChip = wrapper.find('[data-testid="wallet-api-status"]');
    expect(apiChip.text()).toContain('Wallet API: unreachable');
    expect(apiChip.text()).toContain('mock fallback');

    // Default stub health card reports ok:false → unavailable, never guessed.
    const workerChip = wrapper.find('[data-testid="order-worker-status"]');
    expect(workerChip.text()).toBe('Order worker: unavailable');
  });

  it('shows the operational worker chip when the health card is ok', async () => {
    const healthy = workerSource({
      component: 'order-worker',
      ok: true,
      checkedAt: '2026-08-17T00:00:00.000Z',
    });
    const { wrapper } = await mountHomePage(healthy);

    expect(wrapper.find('[data-testid="order-worker-status"]').text()).toBe(
      'Order worker: operational',
    );
  });

  it('renders affordance cards with honest availability lines and working links', async () => {
    const { wrapper } = await mountHomePage();
    const text = wrapper.text();

    expect(text).toContain('Wallets & balances');
    expect(text).toContain('zeros are never fabricated');
    expect(text).toContain('quotes pause — they are never invented');
    expect(text).toContain('degrades fail-closed');

    // Mock wallets loaded → affordance links target the first wallet.
    const swapLink = wrapper
      .findAll('a')
      .find((link) => link.text().includes('Start a swap'));
    expect(swapLink).toBeTruthy();
    expect(swapLink!.attributes('href')).toContain(MOCK_WALLETS[0].id);
    expect(swapLink!.attributes('href')).toContain('/swap');
    const ordersLink = wrapper
      .findAll('a')
      .find((link) => link.text().includes('View orders'));
    expect(ordersLink!.attributes('href')).toContain('/orders');
  });

  it('lists what is not live yet — explicitly, as a feature', async () => {
    const { wrapper } = await mountHomePage();
    const text = wrapper.text();

    expect(text).toContain('Not live yet');
    expect(text).toContain('dry-run only');
    expect(text).toContain('Order-worker endpoints are pending');
    expect(text).toContain('Robinhood Chain is shown but disabled');
    expect(text).toContain('WalletConnect is not integrated');
  });
});
