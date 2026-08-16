<script setup lang="ts">
import { computed } from 'vue';
import { useData } from 'vitepress';

/**
 * Phase-honesty banner. Every page carries front matter `status` with one
 * of the frozen values: live | preview | planned. The banner renders that
 * status verbatim so a reader always knows whether the described feature
 * can be used today.
 */
const { frontmatter } = useData();

const COPY = {
  live: {
    label: 'Live',
    text: 'Available in Kryptr today, within the phase boundaries stated on this page.',
  },
  preview: {
    label: 'Preview',
    text: 'Built and visible in the app, but not fully enabled yet — it degrades fail-closed.',
  },
  planned: {
    label: 'Planned',
    text: 'Designed and contract-frozen, but not available yet. Nothing described here can be used today.',
  },
} as const;

type Status = keyof typeof COPY;

const status = computed<Status | null>(() => {
  const raw = frontmatter.value.status;
  return raw === 'live' || raw === 'preview' || raw === 'planned' ? raw : null;
});

const current = computed(() => (status.value ? COPY[status.value] : null));
</script>

<template>
  <div
    v-if="current && status"
    class="status-banner"
    :class="`status-banner--${status}`"
    role="note"
    aria-label="Phase status"
  >
    <span class="status-banner__badge">{{ current.label }}</span>
    <span class="status-banner__text">{{ current.text }}</span>
  </div>
</template>
