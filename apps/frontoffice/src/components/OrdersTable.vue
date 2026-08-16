<script setup lang="ts">
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kryptr/shared-ui/vue/table';
import { Badge } from '@kryptr/shared-ui/vue/badge';
import type { Order } from '@kryptr/shared-types';
import { shortAddress, formatTimestamp, CHAIN_LABELS } from '@/lib/format';
import OrderStatusBadge from '@/components/OrderStatusBadge.vue';

defineProps<{ orders: Order[]; workerDown: boolean }>();

const TYPE_LABELS: Record<Order['type'], string> = {
  limit: 'Limit',
  stop: 'Stop',
  dca: 'DCA',
  twap: 'TWAP',
};

/** Assets render as "Native" or a shortened address; no symbol guessing. */
function assetLabel(address: `0x${string}` | null): string {
  return address === null ? 'Native' : shortAddress(address);
}

/** Trigger condition column: limit price or DCA cadence. */
function triggerLabel(order: Order): string {
  if (order.type === 'limit' && order.limitPrice !== null) {
    return `@ ${order.limitPrice}`;
  }
  if (order.type === 'dca' && order.interval !== null) {
    return `every ${order.interval}`;
  }
  return '—';
}
</script>

<template>
  <div class="space-y-3">
    <p
      v-if="workerDown"
      data-testid="orders-stale-note"
      class="text-muted-foreground text-xs"
    >
      The order worker is down — statuses below may be stale. Refresh after the
      worker returns; nothing executes while it is unreachable.
    </p>

    <div v-if="orders.length === 0" class="space-y-1 py-8 text-center">
      <p class="font-medium">No orders yet</p>
      <p class="text-muted-foreground text-sm">
        Limit and DCA orders you create for this wallet will appear here.
      </p>
    </div>

    <Table v-else>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Side</TableHead>
          <TableHead>Pair</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Trigger</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow
          v-for="order in orders"
          :key="order.id"
          :data-order-id="order.id"
        >
          <TableCell>
            <Badge variant="outline">{{ TYPE_LABELS[order.type] }}</Badge>
          </TableCell>
          <TableCell class="capitalize">{{ order.side }}</TableCell>
          <TableCell class="font-mono text-xs">
            {{ assetLabel(order.baseAsset) }} →
            {{ assetLabel(order.quoteAsset) }}
            <span class="text-muted-foreground">
              ({{ CHAIN_LABELS[order.chain] }})
            </span>
          </TableCell>
          <TableCell class="font-mono text-xs">{{ order.amount }}</TableCell>
          <TableCell class="font-mono text-xs">{{
            triggerLabel(order)
          }}</TableCell>
          <TableCell>
            <OrderStatusBadge :status="order.status" />
          </TableCell>
          <TableCell class="text-muted-foreground text-xs">
            {{ formatTimestamp(order.createdAt) }}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
