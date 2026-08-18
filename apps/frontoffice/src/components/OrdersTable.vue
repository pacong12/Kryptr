<script setup lang="ts">
import { ref } from 'vue';
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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/vue/card';
import { Input } from '@kryptr/shared-ui/vue/input';
import { Label } from '@kryptr/shared-ui/vue/label';
import type {
  ApiError,
  Order,
  OrderExecution,
  WalletBalance,
} from '@kryptr/shared-types';
import { List, X } from '@lucide/vue';
import { toast } from 'vue-sonner';
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
  (event: 'cancel-order', orderId: string): void;
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

// Task 3.2: Cancel order modal state
const cancelOrderModalOpen = ref(false);
const selectedOrderId = ref<string | null>(null);
const cancelReason = ref('');

function openCancelOrder(orderId: string): void {
  selectedOrderId.value = orderId;
  cancelReason.value = '';
  cancelOrderModalOpen.value = true;
}

function handleCancelOrder(): void {
  if (!selectedOrderId.value || !cancelReason.value.trim()) {
    toast.error('Cancellation required', {
      description: 'Please provide a reason for order cancellation.',
    });
    return;
  }

  emit('cancel-order', selectedOrderId.value);
  cancelOrderModalOpen.value = false;
  
  toast.success('Order cancelled', {
    description: `Order ${selectedOrderId.value} has been cancelled.`,
  });
}

function closeCancelOrder(): void {
  cancelOrderModalOpen.value = false;
  selectedOrderId.value = null;
  cancelReason.value = '';
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
            <span class="sr-only">Actions</span>
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
              
              <!-- Task 3.2: Cancel order button -->
              <Button
                v-if="order.status === 'pending' || order.status === 'active'"
                variant="ghost"
                size="icon"
                class="ml-2 text-destructive hover:text-destructive"
                :aria-label="`Cancel order ${order.id}`"
                @click="openCancelOrder(order.id)"
              >
                <X aria-hidden="true" />
              </Button>
            </TableCell>
          </TableRow>

          <!-- Execution panel row (existing functionality) -->
          <TableRow
            v-if="expandedOrderId === order.id && executionsState === 'ready'"
            :data-order-id="`${order.id}-executions`"
            class="bg-muted/30"
          >
            <TableCell :colspan="8">
              <OrderExecutionPanel
                :order-id="order.id"
                :executions="executions"
                :error="executionsError"
              />
            </TableCell>
          </TableRow>
        </template>
      </TableBody>
    </Table>

    <!-- Task 3.2: Cancel order confirmation modal -->
    <Card
      v-if="cancelOrderModalOpen"
      class="max-w-md animate-in fade-in duration-200"
    >
      <CardHeader>
        <CardTitle class="flex items-center justify-between gap-2">
          Cancel Order
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6"
            @click="closeCancelOrder"
          >
            <X class="h-4 w-4" />
          </Button>
        </CardTitle>
        <CardDescription>
          Provide a reason for cancelling this order. This action cannot be undone once executed.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <Label for="cancel-reason">Cancellation Reason</Label>
          <Input
            id="cancel-reason"
            v-model="cancelReason"
            placeholder="e.g., No longer interested in position, market changed..."
            :disabled="false"
          />
          <p class="text-xs text-muted-foreground">
            Required field for audit trail purposes.
          </p>
        </div>

        <div
          v-if="selectedOrderId"
          class="rounded-lg border bg-muted p-3 text-sm"
        >
          <p class="font-medium">Order ID: {{ selectedOrderId }}</p>
          <p class="text-muted-foreground text-xs">
            Cancellation will only take effect if order hasn't executed yet.
          </p>
        </div>
      </CardContent>
      <CardFooter class="flex justify-end gap-2">
        <Button variant="outline" @click="closeCancelOrder">
          Close
        </Button>
        <Button variant="destructive" @click="handleCancelOrder">
          Confirm Cancellation
        </Button>
      </CardFooter>
    </Card>
  </div>
</template>
