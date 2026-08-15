import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import App from './App.vue';
import { createAppRouter } from '@/router';

describe('App shell', () => {
  beforeEach(() => {
    // API unreachable -> composables fall back to mock mode.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the nav header, home hero, and connect CTA', async () => {
    const router = createAppRouter(createMemoryHistory());
    router.push('/');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('header').exists()).toBe(true);
    expect(wrapper.find('main').exists()).toBe(true);
    expect(wrapper.text()).toContain('Kryptr');
    expect(wrapper.text()).toContain('Connect Wallet');
    expect(wrapper.text()).toContain('security gate');
  });

  it('shows a reachable footer note and frontoffice badge', async () => {
    const router = createAppRouter(createMemoryHistory());
    router.push('/');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('footer').exists()).toBe(true);
    expect(wrapper.text()).toContain('frontoffice');
  });
});
