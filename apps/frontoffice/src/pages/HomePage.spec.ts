import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import HomePage from './HomePage.vue';
import { MOCK_WALLETS } from '@/lib/fixtures';
import { shortAddress } from '@/lib/format';
import { createAppRouter } from '@/router';

function buttonByText(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper
    .findAll('button')
    .find((button) => button.text().includes(text));
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

  async function mountHomePage() {
    const router = createAppRouter(createMemoryHistory());
    router.push('/');
    await router.isReady();
    const wrapper = mount(HomePage, { global: { plugins: [router] } });
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
