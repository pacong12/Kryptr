<script setup lang="ts">
import type { WorkerHealth } from '@kryptr/shared-types';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kryptr/shared-ui/vue/alert';
import { TriangleAlert } from '@lucide/vue';
import { formatTimestamp } from '@/lib/format';

defineProps<{ health: WorkerHealth }>();
</script>

<template>
  <Alert data-testid="worker-health-banner">
    <TriangleAlert aria-hidden="true" />
    <AlertTitle>Order worker unavailable</AlertTitle>
    <AlertDescription>
      The order worker reported unhealthy
      <template v-if="health.detail"> ({{ health.detail }})</template>
      at {{ formatTimestamp(health.checkedAt) }}. Orders stay visible but
      statuses may be stale; new orders and scheduled executions are refused
      until the worker returns. Kryptr fails closed — nothing runs while the
      worker is down.
    </AlertDescription>
  </Alert>
</template>
