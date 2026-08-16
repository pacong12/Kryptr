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
import { Button } from '@kryptr/shared-ui/vue/button';
import type {
  ApiError,
  Order,
  OrderExecution,
  WalletBalance,
} from '@kryptr/shared-types';
import { List } from '@lucide/vue';
import {
  CHAIN_LABELS,
  formatTimestamp,
  formatUnits,
  resolveAssetMeta,
  shortAddress,
} from '@/lib/format';
import type { OrderExecutionsState } from '@/composables/useOrderExecutions';
import OrderExecutionPanel from '@/components/OrderExecutionPanel.vue';
import OrderStatusBadge from '@/components/OrderStatusBadge.vue';

const props = defineProps<{
  orders: Order[];
  workerDown: boolean;
  /** Used to format raw-unit amounts; unknown assets render raw. */
  balances: WalletBalance[];
  /** Executions expansion state (owned by the page). */
  expandedOrderId: string | null;
  executionsState: OrderExecutionsState;
  executions: OrderExecution[];
  executionsError: ApiError | null;
}>();

const emit = defineEmits<{
  (event: 'toggle-executions', orderId: string): void;
}>();

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

/**
 * Format the raw-unit amount via the wallet's known asset metadata
 * (#52 follow-up). The denomination asset is SIDE-AWARE to match the worker
 * contract: a BUY amount is raw units of the QUOTE asset (amount to spend);
 * a SELL amount is raw units of the BASE asset (amount to sell). An unknown
 * asset falls back to the raw string — the table never invents decimals or
 * symbols.
 */
function amountLabel(order: Order): string {
  const asset = order.side === 'buy' ? order.quoteAsset : order.baseAsset;
  const meta = resolveAssetMeta(order.chain, asset, props.balances);
  if (meta === null) return order.amount;
  return `${formatUnits(order.amount, meta.decimals)} ${meta.symbol}`;
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
          <TableHead class="w-10">
            <span class="sr-only">Executions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <template v-for="order in orders" :key="order.id">
          <TableRow :data-order-id="order.id">
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
            <TableCell class="font-mono text-xs">
              {{ amountLabel(order) }}
            </TableCell>
            <TableCell class="font-mono text-xs">{{
              triggerLabel(order)
            }}</TableCell>
            <TableCell>
              <OrderStatusBadge :status="order.status" />
            </TableCell>
            <TableCell class="text-muted-foreground text-xs">
              {{ formatTimestamp(order.createdAt) }}
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="icon"
                :aria-label="`Show executions for order ${order.id}`"
                :aria-expanded="expandedOrderId === order.id"
                @click="emit('toggle-executions', order.id)"
              >
                <List aria-hidden="true" />
              </Button>
            </TableCell>
          </TableRow>
          <TableRow
            v-if="expandedOrderId === order.id"
            :data-executions-row="order.id"
          >
            <TableCell colspan="8">
              <OrderExecutionPanel
                :state="executionsState"
                :executions="executions"
                :error="executionsError"
              />
            </TableCell>
          </TableRow>
        </template>
      </TableBody>
    </Table>
  </div>
</template>
