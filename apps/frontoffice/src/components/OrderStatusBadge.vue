<script setup lang="ts">
import { computed } from 'vue';
import type { OrderStatus } from '@kryptr/shared-types';
import { Badge } from '@kryptr/shared-ui/vue/badge';

const props = defineProps<{ status: OrderStatus }>();

/**
 * Full frozen lifecycle (wave-4 freeze §1) → badge copy + variant.
 * Live/in-flight states read `default`, neutral states `secondary`,
 * quiet terminal states `outline`, failure terminal states `destructive`.
 */
const STATUS_META: Record<
  OrderStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'outline' | 'destructive';
  }
> = {
  pending_approval: { label: 'Pending approval', variant: 'secondary' },
  open: { label: 'Open', variant: 'default' },
  paused: { label: 'Paused', variant: 'secondary' },
  triggered: { label: 'Triggered', variant: 'default' },
  partially_filled: { label: 'Partially filled', variant: 'default' },
  filled: { label: 'Filled', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'outline' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  expired: { label: 'Expired', variant: 'outline' },
  failed: { label: 'Failed', variant: 'destructive' },
};

const meta = computed(() => STATUS_META[props.status]);
</script>

<template>
  <Badge :variant="meta.variant" :data-status="status">
    {{ meta.label }}
  </Badge>
</template>
