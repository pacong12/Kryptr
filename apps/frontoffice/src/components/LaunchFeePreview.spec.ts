import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { FEE_RECIPIENT_KEYS } from '@/lib/feePreview';
import LaunchFeePreview from './LaunchFeePreview.vue';
import { MOCK_LAUNCH_DRAFT } from '@/lib/fixtures';

function mountPreview() {
  return mount(LaunchFeePreview, {
    props: {
      feeBps: MOCK_LAUNCH_DRAFT.feeBps,
      feeRecipients: MOCK_LAUNCH_DRAFT.feeRecipients,
    },
  });
}

describe('LaunchFeePreview (integer-bps cost-per-$100)', () => {
  it('renders one row per frozen recipient key', () => {
    const wrapper = mountPreview();

    for (const key of FEE_RECIPIENT_KEYS) {
      expect(wrapper.find(`[data-fee-recipient="${key}"]`).exists()).toBe(true);
    }
  });

  it('shows cost per $100 via pure integer cent arithmetic', () => {
    const wrapper = mountPreview();

    // 175 bps total → $1.75; creator 67 bps → $0.67. No float drift.
    expect(
      wrapper.find('[data-testid="fee-preview-cost-per-100"]').text(),
    ).toBe('$1.75');
    expect(wrapper.find('[data-fee-recipient="creator"]').text()).toContain(
      '$0.67',
    );
    expect(wrapper.find('[data-testid="fee-preview-total"]').text()).toContain(
      '1.75%',
    );
  });

  it('shows shortened recipient addresses, never full ones', () => {
    const wrapper = mountPreview();
    const creatorRow = wrapper.find('[data-fee-recipient="creator"]').text();

    expect(creatorRow).toContain('0xaaa1');
    expect(creatorRow).not.toContain(MOCK_LAUNCH_DRAFT.feeRecipients.creator);
  });

  it('notes that float shares never touch money math', () => {
    expect(mountPreview().text()).toContain('float shares never touch');
  });
});
