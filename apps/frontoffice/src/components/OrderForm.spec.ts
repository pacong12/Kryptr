import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { OrderType, WalletBalance } from '@kryptr/shared-types';
import OrderForm from './OrderForm.vue';
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

/** reka-ui portals open select content to document.body. */
function selectItems(): HTMLElement[] {
  return [
    ...document.body.querySelectorAll<HTMLElement>('[data-slot="select-item"]'),
  ];
}

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const balances: WalletBalance[] = [
  {
    walletId: 'wallet-base-demo',
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

function mountForm(overrides: Record<string, unknown> = {}) {
  return mount(OrderForm, {
    props: {
      chains: ['base'],
      chain: 'base',
      balances,
      type: 'limit' as OrderType,
      side: 'buy',
      baseAsset: NATIVE_ASSET,
      quoteAsset: USDC,
      amount: '0.5',
      limitPrice: '3000',
      interval: 'P1D',
      submitting: false,
      workerDown: false,
      ...overrides,
    },
  });
}

function createButton(wrapper: VueWrapper): HTMLButtonElement | undefined {
  return [...wrapper.findAll('button')].find((button) =>
    (button.text() ?? '').includes('Create'),
  )?.element as HTMLButtonElement | undefined;
}

describe('OrderForm (limit + dca; stop/twap rejected explicitly)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows all four order types — stop/twap are visible, never hidden', async () => {
    const wrapper = mountForm();
    await openSelect(wrapper, '#order-type');

    const labels = selectItems().map((item) => item.textContent ?? '');
    expect(labels).toContain('Limit');
    expect(labels).toContain('DCA');
    expect(labels).toContain('Stop');
    expect(labels).toContain('TWAP');
    wrapper.unmount();
  });

  it('rejects stop with the coded order_type_unsupported message', () => {
    const wrapper = mountForm({ type: 'stop' });

    const alert = wrapper.find('[data-testid="order-type-unsupported"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('Order type not supported');
    expect(alert.text()).toContain('order_type_unsupported');
    expect(createButton(wrapper)?.disabled).toBe(true);
    wrapper.unmount();
  });

  it('rejects twap the same explicit way', () => {
    const wrapper = mountForm({ type: 'twap' });

    expect(
      wrapper.find('[data-testid="order-type-unsupported"]').exists(),
    ).toBe(true);
    expect(createButton(wrapper)?.disabled).toBe(true);
    wrapper.unmount();
  });

  it('limit shows the price field; dca shows the interval field', () => {
    const limit = mountForm({ type: 'limit' });
    expect(limit.find('#order-limit-price').exists()).toBe(true);
    expect(limit.find('#order-interval').exists()).toBe(false);
    limit.unmount();

    const dca = mountForm({ type: 'dca' });
    expect(dca.find('#order-interval').exists()).toBe(true);
    expect(dca.find('#order-limit-price').exists()).toBe(false);
    dca.unmount();
  });

  it('emits submit for a valid limit order', async () => {
    const wrapper = mountForm();

    const button = createButton(wrapper);
    expect(button?.disabled).toBe(false);
    await wrapper
      .findAll('button')
      .find((candidate) => (candidate.text() ?? '').includes('Create'))!
      .trigger('click');

    expect(wrapper.emitted('submit')).toHaveLength(1);
    wrapper.unmount();
  });

  it('blocks submission while the worker is down (fail-closed) with a reason', () => {
    const wrapper = mountForm({ workerDown: true });

    expect(createButton(wrapper)?.disabled).toBe(true);
    expect(wrapper.text()).toContain('order worker is down');
    wrapper.unmount();
  });

  it('keeps the form invalid until base and quote differ', async () => {
    const wrapper = mountForm({ quoteAsset: NATIVE_ASSET });
    expect(createButton(wrapper)?.disabled).toBe(true);
    wrapper.unmount();
  });
});
