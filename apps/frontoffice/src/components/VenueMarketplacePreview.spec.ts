import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import VenueMarketplacePreview from './VenueMarketplacePreview.vue';

describe('VenueMarketplacePreview', () => {
  it('renders default S4 venue preview details', () => {
    const wrapper = mount(VenueMarketplacePreview);
    expect(wrapper.text()).toContain('Venue Marketplace');
    expect(wrapper.text()).toContain('Uniswap v4 Launchpool');
    expect(wrapper.text()).toContain('uniswap-v4-pool');
    expect(wrapper.text()).toContain('0.09% (8.75 bps)');
    expect(wrapper.text()).toContain('active');
  });

  it('renders custom venue prop data correctly', () => {
    const wrapper = mount(VenueMarketplacePreview, {
      props: {
        venue: {
          venueId: 'base-sepolia:0x:aggregator',
          name: '0x Aggregator Pool',
          kind: '0x-liquidity',
          venueBps: 12.5,
          status: 'active',
        },
        badgeText: 'Custom Venue',
      },
    });

    expect(wrapper.text()).toContain('0x Aggregator Pool');
    expect(wrapper.text()).toContain('0x-liquidity');
    expect(wrapper.text()).toContain('0.13% (12.5 bps)');
    expect(wrapper.text()).toContain('Custom Venue');
  });
});
