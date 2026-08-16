import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { VERIFICATION_CLAIMS } from '@kryptr/shared-types';
import T21VerificationCard from './T21VerificationCard.vue';
import { MOCK_VERIFICATION_ARTIFACT } from '@/lib/fixtures';

function mountCard(
  props: Partial<InstanceType<typeof T21VerificationCard>['$props']>,
) {
  return mount(T21VerificationCard, {
    props: {
      state: 'verified',
      reason: null,
      claims: MOCK_VERIFICATION_ARTIFACT.claims,
      mockMode: false,
      ...props,
    },
  });
}

describe('T21VerificationCard (claims only from the fetched artifact)', () => {
  it('PARITY: renders one row per frozen claim kind — exactly the vocabulary, no more', () => {
    // The frozen vocabulary drives the copy map; guard against drift both ways.
    expect(VERIFICATION_CLAIMS).toHaveLength(4);

    const wrapper = mountCard({});
    const rows = wrapper.findAll('[data-testid="verification-row"]');

    // admin_key_free + non_upgradeable collapse into one grouped row.
    expect(rows).toHaveLength(3);
    expect(wrapper.text()).toContain('No admin, no upgrades');
    expect(wrapper.text()).toContain('Fees cannot change after launch');
    expect(wrapper.text()).toContain('Bond accounting verified');
    expect(wrapper.text()).not.toContain('bug-free');
    expect(wrapper.text()).not.toContain('risk-free');
  });

  it('renders individual copy when only one of the admin/upgrade claims exists', () => {
    const onlyAdmin = MOCK_VERIFICATION_ARTIFACT.claims.filter(
      (claim) => claim.claim !== 'non_upgradeable',
    );
    const wrapper = mountCard({ claims: onlyAdmin });

    expect(wrapper.text()).toContain('No admin keys');
    expect(wrapper.text()).not.toContain('No admin, no upgrades');
  });

  it('shows evidence strings verbatim under each claim', () => {
    const wrapper = mountCard({});
    const evidence = wrapper.findAll('[data-testid="verification-evidence"]');

    expect(evidence.length).toBe(3);
    expect(wrapper.text()).toContain('INV-FEE-1..4 + G4 P-3');
  });

  it('shows the mock badge only when badged fixtures are the source', () => {
    expect(
      mountCard({}).find('[data-testid="verification-mock-badge"]').exists(),
    ).toBe(false);
    expect(
      mountCard({ mockMode: true })
        .find('[data-testid="verification-mock-badge"]')
        .exists(),
    ).toBe(true);
  });

  it('renders no claims while loading', () => {
    const wrapper = mountCard({ state: 'loading', claims: [] });

    expect(wrapper.find('[data-testid="verification-loading"]').exists()).toBe(
      true,
    );
    expect(wrapper.findAll('[data-testid="verification-row"]')).toHaveLength(0);
  });

  it.each([
    ['missing', 'no verification reference'],
    ['fetch_failed', 'could not be fetched'],
    ['id_mismatch', 'id does not match'],
    ['hash_mismatch', 'hash does not match'],
    ['claims_missing', 'no longer covers every consented claim'],
  ] as const)(
    'unverified with reason %s shows honest copy and zero claims',
    (reason, copyFragment) => {
      const wrapper = mountCard({
        state: 'unverified',
        reason,
        claims: MOCK_VERIFICATION_ARTIFACT.claims,
      });

      expect(wrapper.text()).toContain('Not verified');
      expect(
        wrapper.find('[data-testid="verification-reason"]').text(),
      ).toContain(copyFragment);
      expect(wrapper.findAll('[data-testid="verification-row"]')).toHaveLength(
        0,
      );
    },
  );

  it('skips claim strings outside the frozen vocabulary at runtime', () => {
    const stranger = {
      ...MOCK_VERIFICATION_ARTIFACT.claims[0],
      claim: 'future_claim' as (typeof VERIFICATION_CLAIMS)[number],
    };
    const wrapper = mountCard({
      claims: [...MOCK_VERIFICATION_ARTIFACT.claims, stranger],
    });

    expect(wrapper.text()).not.toContain('future_claim');
    expect(wrapper.findAll('[data-testid="verification-row"]')).toHaveLength(3);
  });
});
