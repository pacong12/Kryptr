import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import App from './App.vue';

describe('App', () => {
  it('renders the shared-ui smoke page', async () => {
    const wrapper = mount(App, {});
    expect(wrapper.text()).toContain('Kryptr Frontoffice');
    expect(wrapper.text()).toContain('Connect Wallet');
  });
});
