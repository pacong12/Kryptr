import { beforeAll, describe, expect, it } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { WalletBalance } from '@kryptr/shared-types';
import SwapForm from './SwapForm.vue';
import { NATIVE_ASSET } from '@/lib/format';

// jsdom lacks the pointer-capture APIs reka-ui's Select relies on.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

/**
 * Open a reka-ui select in jsdom: dispatch a left-button pointerdown
 * manually (jsdom's synthetic events can't carry `button`).
 */
async function openSelect(
  wrapper: VueWrapper,
  selector: string,
): Promise<void> {
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'button', { value: 0 });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  wrapper.find(selector).element.dispatchEvent(event);
  await flushPromises();
}

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

function balancesWith(usdcAmount: string): WalletBalance[] {
  return [
    {
      walletId: 'wallet-base-demo',
      chain: 'base',
      nativeBalance: '1500000000000000000',
      tokens: [
        {
          contractAddress: USDC,
          symbol: 'USDC',
          decimals: 6,
          amount: usdcAmount,
        },
      ],
    },
  ];
}

function mountForm(overrides: Record<string, unknown> = {}) {
  return mount(SwapForm, {
    attachTo: document.body,
    props: {
      chains: ['base'],
      chain: 'base',
      balances: balancesWith('0'),
      assetIn: NATIVE_ASSET,
      assetOut: USDC,
      amount: '',
      ...overrides,
    },
  });
}

/** reka-ui portals open select content to document.body. */
function selectItems(): HTMLElement[] {
  return [
    ...document.body.querySelectorAll<HTMLElement>('[data-slot="select-item"]'),
  ];
}

describe('SwapForm asset options (real balances)', () => {
  it('shows zero-balance sell assets disabled with a reason, never hides them', async () => {
    const wrapper = mountForm();

    await openSelect(wrapper, '#swap-asset-in');
    const items = selectItems();
    const usdc = items.find((item) => item.textContent?.includes('USDC'));
    expect(usdc).toBeTruthy();
    expect(usdc!.textContent).toContain('No balance');
    expect(usdc!.hasAttribute('data-disabled')).toBe(true);

    // Native has a real balance: enabled.
    const native = items.find((item) => item.textContent?.includes('(native)'));
    expect(native!.hasAttribute('data-disabled')).toBe(false);
    wrapper.unmount();
  });

  it('keeps non-zero sell assets selectable', async () => {
    const wrapper = mountForm({ balances: balancesWith('2500000000') });
    await openSelect(wrapper, '#swap-asset-in');

    const usdc = selectItems().find((item) =>
      item.textContent?.includes('USDC'),
    );
    expect(usdc!.textContent).not.toContain('No balance');
    expect(usdc!.hasAttribute('data-disabled')).toBe(false);
    wrapper.unmount();
  });

  it('never fabricates zeros: a missing chain entry hides the balance hint', () => {
    const wrapper = mountForm({ balances: [] });
    expect(wrapper.text()).not.toContain('Available:');
    wrapper.unmount();
  });

  it('shows the real balance hint when the chain entry exists', () => {
    const wrapper = mountForm({ balances: balancesWith('2500000000') });
    expect(wrapper.text()).toContain('Available: 1.5 ETH');
    wrapper.unmount();
  });
});
