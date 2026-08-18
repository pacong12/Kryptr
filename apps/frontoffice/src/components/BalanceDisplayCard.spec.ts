import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import BalanceDisplayCard from './BalanceDisplayCard.vue';

describe('BalanceDisplayCard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mockWalletId = 'wallet-base-demo';

  function mountComponent() {
    return mount(BalanceDisplayCard, {
      props: { walletId: mockWalletId },
      attachTo: document.body,
    });
  }

  it('shows loading skeleton on initial mount', async () => {
    const wrapper = mountComponent();

    // Should show loading state immediately
    expect(wrapper.find('[data-testid="balance-loading-skeleton"]').exists()).toBe(true);

    await flushPromises();
    await new Promise(resolve => setTimeout(resolve, 100));
    await flushPromises();

    wrapper.unmount();
  });

  it.skip('switches between chain views correctly', async () => {
    const wrapper = mountComponent();
    await flushPromises();
    await new Promise(resolve => setTimeout(resolve, 100));
    await flushPromises();

    // Click Robinhood Chain button
    const robinhoodBtn = wrapper.findAll('button')[1];
    await robinhoodBtn.trigger('click');

    expect(wrapper.html()).toContain('Robinhood Chain');

    wrapper.unmount();
  });

  it.skip('renders ETH and USDC balance cards after loading', async () => {
    const wrapper = mountComponent();
    await flushPromises();
    await new Promise(resolve => setTimeout(resolve, 120));
    await flushPromises();

    expect(wrapper.text()).toContain('ETH');
    expect(wrapper.text()).toContain('USDC');
    expect(wrapper.text()).toContain('Base');

    wrapper.unmount();
  });
});
