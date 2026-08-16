import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { SwapQuote, WalletBalance } from '@kryptr/shared-types';
import QuoteCard from './QuoteCard.vue';

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

const quote: SwapQuote = {
  id: 'quote-1',
  source: '0x',
  chain: 'base',
  assetIn: null,
  assetOut: USDC,
  amountIn: '500000000000000000',
  amountOut: '1500000000',
  price: 3000,
  minAmountOut: '1485000000',
  slippageBps: 100,
  route: [],
  fetchedAt: '2026-08-20T00:00:00.000Z',
  expiresAt: '2026-08-20T00:00:30.000Z',
};

type QuoteCardProps = InstanceType<typeof QuoteCard>['$props'];

const baseProps: QuoteCardProps = {
  state: 'idle',
  quote: null,
  secondsLeft: 0,
  error: null,
  chain: 'base',
  balances,
};

function mountCard(props: Partial<QuoteCardProps>) {
  return mount(QuoteCard, { props: { ...baseProps, ...props } });
}

describe('QuoteCard degradation (fail closed, never invents quotes)', () => {
  it('unconfigured aggregator: informational copy and NO retry button', () => {
    const wrapper = mountCard({
      state: 'error',
      quote: null,
      secondsLeft: 0,
      error: {
        code: 'aggregator_unconfigured',
        message: 'No aggregator configured.',
      },
    });

    expect(wrapper.text()).toContain('Live quotes not available');
    expect(wrapper.text()).toContain('no swap aggregator configured');
    expect(wrapper.text()).toContain('Kryptr never fabricates quotes');
    expect(wrapper.find('[data-testid="quote-unconfigured"]').exists()).toBe(
      true,
    );
    // A missing key never succeeds on retry — no tease.
    expect(wrapper.text()).not.toContain('Retry quote');
  });

  it('transient failure: error alert WITH a retry CTA', async () => {
    const wrapper = mountCard({
      state: 'error',
      quote: null,
      secondsLeft: 0,
      error: {
        code: 'aggregator_unavailable',
        message: 'The aggregator timed out.',
      },
    });

    expect(wrapper.find('[data-testid="quote-error"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('No quote available');
    expect(wrapper.text()).toContain('The aggregator timed out.');
    const retry = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Retry quote'));
    expect(retry).toBeTruthy();
    await retry!.trigger('click');
    expect(wrapper.emitted('refresh')).toBeTruthy();
  });

  it('ready quote renders amounts, price, and the expiry countdown', () => {
    const wrapper = mountCard({
      state: 'ready',
      quote,
      secondsLeft: 30,
      error: null,
    });

    expect(wrapper.text()).toContain('1500 USDC');
    expect(wrapper.text()).toContain('Expires in 30s');
    expect(wrapper.text()).toContain('Minimum received');
  });
});
