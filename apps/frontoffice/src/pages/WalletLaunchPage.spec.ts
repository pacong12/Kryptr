import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import type {
  ApiEnvelope,
  DeployContext,
  VerificationArtifactRef,
} from '@kryptr/shared-types';
import { ok } from '@kryptr/shared-types';
import App from '@/app/App.vue';
import { MOCK_LAUNCH_DRAFT, MOCK_VERIFICATION_ARTIFACT } from '@/lib/fixtures';
import { createAppRouter } from '@/router';

const WALLET_ID = 'wallet-base-demo';

/**
 * Fetch mock for the launchpad endpoints only (draft + verification).
 * While the launchpad API has not landed, failing fetches drive the badged
 * fixture fallback; live envelopes are never fixture-masked.
 */
function fetchMock(
  options: {
    draft?: ApiEnvelope<DeployContext> | 'throw';
    verification?: ApiEnvelope<VerificationArtifactRef> | 'throw';
  } = {},
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, init });
      let body: ApiEnvelope<unknown>;
      if (url.includes('/launchpad/wallets/') && url.endsWith('/draft')) {
        if (options.draft === 'throw') throw new TypeError('fetch failed');
        body = options.draft ?? {
          ok: false,
          data: null,
          error: { code: 'not_found', message: 'nope' },
        };
      } else if (url.includes('/launchpad/verification/')) {
        if (options.verification === 'throw')
          throw new TypeError('fetch failed');
        body = options.verification ?? {
          ok: false,
          data: null,
          error: { code: 'not_found', message: 'nope' },
        };
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

async function mountLaunchPage(fetchImpl: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchImpl);
  const router = createAppRouter(createMemoryHistory());
  const wrapper = mount(App, {
    global: { plugins: [router] },
    attachTo: document.body,
  });
  await router.push({ name: 'wallet-launch', params: { walletId: WALLET_ID } });
  await router.isReady();
  await flushPromises();
  return wrapper;
}

describe('WalletLaunchPage (launch consent, fail-closed)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows badged fixtures + earned chip when the API is unreachable', async () => {
    const { impl } = fetchMock({ draft: 'throw', verification: 'throw' });
    const wrapper = await mountLaunchPage(impl);

    expect(wrapper.find('[data-testid="launch-mock-badge"]').exists()).toBe(
      true,
    );
    // Integer-bps cost per $100.
    expect(
      wrapper.find('[data-testid="fee-preview-cost-per-100"]').text(),
    ).toBe('$1.75');
    expect(wrapper.find('[data-testid="launch-total-supply"]').text()).toBe(
      MOCK_LAUNCH_DRAFT.totalSupply,
    );
    expect(wrapper.find('[data-testid="launch-bond-badge"]').text()).toContain(
      'Bond paid',
    );
    // Chip verified against the fixture artifact, badged as mock.
    expect(wrapper.find('[data-testid="verification-status"]').text()).toBe(
      'T21 verified',
    );
    expect(
      wrapper.find('[data-testid="verification-mock-badge"]').exists(),
    ).toBe(true);
    expect(wrapper.text()).toContain('No admin, no upgrades');

    // Consent gated by the permanence acknowledgment.
    const submit = wrapper.find('[data-testid="launch-consent-submit"]');
    expect(submit.attributes('disabled')).toBeDefined();
    await wrapper.find('[data-testid="launch-acknowledge"]').setValue(true);
    expect(
      wrapper
        .find('[data-testid="launch-consent-submit"]')
        .attributes('disabled'),
    ).toBeUndefined();
    wrapper.unmount();
  });

  it('stub consent answers the honest launch_unavailable envelope', async () => {
    const { impl } = fetchMock({ draft: 'throw', verification: 'throw' });
    const wrapper = await mountLaunchPage(impl);

    await wrapper.find('[data-testid="launch-acknowledge"]').setValue(true);
    await wrapper
      .find('[data-testid="launch-consent-submit"]')
      .trigger('click');
    await flushPromises();

    const alert = wrapper.find('[data-testid="launch-consent-error"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('launch_unavailable');
    expect(alert.text()).toContain('not wired');
    wrapper.unmount();
  });

  it('blocks consent when the live artifact hash mismatches — no fixtures', async () => {
    const { impl } = fetchMock({
      draft: ok(MOCK_LAUNCH_DRAFT),
      verification: ok({ ...MOCK_VERIFICATION_ARTIFACT, hash: '0xdeadbeef' }),
    });
    const wrapper = await mountLaunchPage(impl);

    expect(wrapper.find('[data-testid="launch-mock-badge"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="verification-status"]').text()).toBe(
      'Not verified',
    );
    expect(
      wrapper.find('[data-testid="verification-reason"]').text(),
    ).toContain('hash does not match');
    expect(wrapper.findAll('[data-testid="verification-row"]')).toHaveLength(0);

    await wrapper.find('[data-testid="launch-acknowledge"]').setValue(true);
    expect(
      wrapper
        .find('[data-testid="launch-consent-submit"]')
        .attributes('disabled'),
    ).toBeDefined();
    expect(
      wrapper.find('[data-testid="launch-consent-blocked"]').text(),
    ).toContain('blocked');
    wrapper.unmount();
  });

  it('renders live draft error envelopes honestly with a retry', async () => {
    const { impl } = fetchMock({
      draft: {
        ok: false,
        data: null,
        error: {
          code: 'launch_not_allowed',
          message: 'This wallet may not launch.',
        },
      },
    });
    const wrapper = await mountLaunchPage(impl);

    const errorCard = wrapper.find('[data-testid="launch-draft-error"]');
    expect(errorCard.exists()).toBe(true);
    expect(errorCard.text()).toContain('This wallet may not launch.');
    expect(wrapper.find('[data-testid="launch-token-card"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="launch-mock-badge"]').exists()).toBe(
      false,
    );
    wrapper.unmount();
  });
});
