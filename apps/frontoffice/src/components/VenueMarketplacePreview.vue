<script setup lang="ts">
import { computed } from 'vue';

export interface VenueInfo {
  venueId: string;
  name: string;
  kind: 'uniswap-v4-pool' | '0x-liquidity';
  venueBps: number;
  status: 'active' | 'suspended' | 'superseded';
}

const props = withDefaults(
  defineProps<{
    venue?: VenueInfo;
    badgeText?: string;
  }>(),
  {
    badgeText: 'S4 Preview — Carve-out Model',
    venue: () => ({
      venueId: 'base-sepolia:uniswap-v4:launchpool',
      name: 'Uniswap v4 Launchpool',
      kind: 'uniswap-v4-pool',
      venueBps: 8.75,
      status: 'active',
    }),
  },
);

const formattedShare = computed(() => {
  return `${(props.venue.venueBps / 100).toFixed(2)}%`;
});
</script>

<template>
  <div class="rounded-lg border border-border bg-card p-4 text-card-foreground">
    <div class="flex items-center justify-between">
      <h4 class="text-sm font-semibold tracking-tight">Venue Marketplace</h4>
      <span class="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        {{ badgeText }}
      </span>
    </div>
    <div class="mt-3 space-y-2 text-sm">
      <div class="flex justify-between">
        <span class="text-muted-foreground">Venue Target</span>
        <span class="font-medium">{{ venue.name }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">Adapter Kind</span>
        <span class="font-mono text-xs">{{ venue.kind }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">Venue Share (Carve-out)</span>
        <span class="font-medium">{{ formattedShare }} ({{ venue.venueBps }} bps)</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">Status</span>
        <span
          class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
          :class="venue.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'"
        >
          {{ venue.status }}
        </span>
      </div>
    </div>
  </div>
</template>
