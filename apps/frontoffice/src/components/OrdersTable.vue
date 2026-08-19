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
import { ref, computed } from 'vue';
import { Badge } from '@kryptr/shared-ui/vue/badge';
import { Button } from '@kryptr/shared-ui/vue/button';
import { Input } from '@kryptr/shared-ui/vue/input';
import { Label } from '@kryptr/shared-ui/vue/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kryptr/shared-ui/vue/select';
import type {
  ApiError,
  Order,
  OrderExecution,
  OrderStatus,
  OrderType,
  WalletBalance,
} from '@kryptr/shared-types';
import { List, X } from '@lucide/vue';
import { List, X, Filter } from '@lucide/vue';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

// Task 2.2: Order filters state
const searchQuery = ref('');
const statusFilter = ref<OrderStatus | 'all'>('all');
const typeFilter = ref<OrderType | 'all'>('all');
const dateRangeStart = ref<string>('');
const dateRangeEnd = ref<string>('');

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

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_approval: 'Pending',
  open: 'Active',
  paused: 'Paused',
  triggered: 'Triggered',
  filled: 'Filled',
  partially_filled: 'Partially Filled',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  expired: 'Expired',
  failed: 'Failed',
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
// Task 2.2: Client-side filtering for performance
const filteredOrders = computed(() => {
  return props.orders.filter((order) => {
    // Search query filter
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      const matchesId = order.id.toLowerCase().includes(query);
      const matchesAmount = order.amount.toLowerCase().includes(query);
      if (!matchesId && !matchesAmount) {
        return false;
      }
    }

    // Status filter
    if (statusFilter.value !== 'all' && order.status !== statusFilter.value) {
      return false;
    }

    // Type filter
    if (typeFilter.value !== 'all' && order.type !== typeFilter.value) {
      return false;
    }

    // Date range filter
    if (dateRangeStart.value || dateRangeEnd.value) {
      const createdAt = new Date(order.createdAt);
      
      if (dateRangeStart.value) {
        const startDate = new Date(dateRangeStart.value);
        startDate.setHours(0, 0, 0, 0);
        if (createdAt < startDate) {
          return false;
        }
      }
      
      if (dateRangeEnd.value) {
        const endDate = new Date(dateRangeEnd.value);
        endDate.setHours(23, 59, 59, 999);
        if (createdAt > endDate) {
          return false;
        }
      }
    }

    return true;
  });
});

// Clear all filters
function clearFilters(): void {
  searchQuery.value = '';
  statusFilter.value = 'all';
  typeFilter.value = 'all';
  dateRangeStart.value = '';
  dateRangeEnd.value = '';
  
  toast.success('Filters cleared', {
    description: 'All order filters have been reset.',
  });
}

// Get selected filter count
const selectedFilterCount = computed(() => {
  let count = 0;
  if (statusFilter.value !== 'all') count++;
  if (typeFilter.value !== 'all') count++;
  if (dateRangeStart.value || dateRangeEnd.value) count++;
  if (searchQuery.value) count++;
  return count;
});

// Export filtered orders
function exportFilteredOrders(): void {
  if (filteredOrders.value.length === 0) {
    toast.warning('No data to export', {
      description: 'Apply filters first to see what will be exported.',
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
  const headers = [
    'Order ID',
    'Type',
    'Side',
    'Base Asset',
    'Quote Asset',
    'Amount',
    'Status',
    'Created At',
  ];

  const rows = filteredOrders.value.map((order) => [
    order.id,
    ORDER_TYPE_LABELS[order.type],
    order.side,
    order.baseAsset ? shortAddress(order.baseAsset) : 'Native',
    order.quoteAsset ? shortAddress(order.quoteAsset) : 'Native',
    order.amount,
    STATUS_LABELS[order.status],
    new Date(order.createdAt).toISOString(),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `orders-${new Date().toISOString().split('T')[0]}.csv`,
  );
  link.click();
  URL.revokeObjectURL(url);

  toast.success('Export successful', {
    description: `Downloaded ${filteredOrders.value.length} orders to CSV.`,
  });
}

const ORDER_TYPE_LABELS: Record<Order['type'], string> = {
  limit: 'Limit',
  stop: 'Stop',
  dca: 'DCA',
  twap: 'TWAP',
};
</script>

<template>
  <div class="space-y-4">
    <!-- Task 2.2: Filter toolbar -->
    <Card v-if="selectedFilterCount > 0" class="border-blue-200 bg-blue-50">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center justify-between text-sm">
          <span class="flex items-center gap-2">
            <Filter class="h-4 w-4" />
            Active Filters
          </span>
          <Button variant="ghost" size="sm" @click="clearFilters">
            Clear All
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="flex flex-wrap gap-2">
          <Badge v-if="searchQuery" variant="outline">Search: "{{ searchQuery }}"</Badge>
          <Badge v-if="statusFilter !== 'all'" variant="secondary">
            {{ STATUS_LABELS[statusFilter as OrderStatus] }}
          </Badge>
          <Badge v-if="typeFilter !== 'all'" variant="secondary">
            {{ TYPE_LABELS[typeFilter as OrderType] }}
          </Badge>
          <Badge v-if="dateRangeStart || dateRangeEnd" variant="outline">
            Date: {{ dateRangeStart || 'Any' }} - {{ dateRangeEnd || 'Now' }}
          </Badge>
        </div>
      </CardContent>
    </Card>

    <div class="grid gap-4 md:grid-cols-[1fr_auto]">
      <p
        v-if="workerDown"
        data-testid="orders-stale-note"
        class="text-muted-foreground text-xs"
      >
        The order worker is down — statuses below may be stale. Refresh after the
        worker returns; nothing executes while it is unreachable.
      </p>

      <div class="flex flex-col sm:flex-row gap-3">
        <!-- Task 2.2: Search input -->
        <Input
          v-model="searchQuery"
          placeholder="Search by ID or amount..."
          class="max-w-sm"
          data-testid="orders-search-input"
        />

        <!-- Task 2.2: Status filter dropdown -->
        <Select v-model="statusFilter">
          <SelectTrigger class="w-[180px]" data-testid="orders-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem v-for="(label, status) in STATUS_LABELS" :key="status" :value="status">
              {{ label }}
            </SelectItem>
          </SelectContent>
        </Select>

        <!-- Task 2.2: Type filter dropdown -->
        <Select v-model="typeFilter">
          <SelectTrigger class="w-[180px]" data-testid="orders-type-filter">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem v-for="(label, type) in TYPE_LABELS" :key="type" :value="type">
              {{ label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="grid gap-1 sm:grid-cols-2">
        <div class="space-y-1">
          <Label for="filter-start" class="text-xs">From</Label>
          <Input id="filter-start" v-model="dateRangeStart" type="date" data-testid="orders-date-start" />
        </div>
        <div class="space-y-1">
          <Label for="filter-end" class="text-xs">To</Label>
          <Input id="filter-end" v-model="dateRangeEnd" type="date" data-testid="orders-date-end" />
        </div>
      </div>

      <!-- Task 2.2: Export button -->
      <Button
        variant="outline"
        size="sm"
        @click="exportFilteredOrders"
        :disabled="filteredOrders.length === 0"
      >
        Export CSV
      </Button>
    </div>

    <p class="text-xs text-muted-foreground">
      Showing {{ filteredOrders.length }} of {{ orders.length }} orders
      ({{ filteredOrders.length === orders.length ? 'no filters applied' : 'filters active' }})
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
    <table class="w-full text-left text-sm">
      <thead class="border-b border-border bg-muted/50">
        <tr>
          <th class="px-4 py-3 font-medium">Type</th>
          <th class="px-4 py-3 font-medium">Side</th>
          <th class="px-4 py-3 font-medium">Pair</th>
          <th class="px-4 py-3 font-medium">Amount</th>
          <th class="px-4 py-3 font-medium">Trigger</th>
          <th class="px-4 py-3 font-medium">Status</th>
          <th class="px-4 py-3 font-medium">Created</th>
          <th class="px-4 py-3 font-medium w-10">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        <template v-for="order in filteredOrders" :key="order.id">
          <tr :data-order-id="order.id">
            <td class="px-4 py-2">
              <Badge variant="outline">{{ TYPE_LABELS[order.type] }}</Badge>
            </td>
            <td class="px-4 py-2 capitalize">{{ order.side }}</td>
            <td class="px-4 py-2 font-mono text-xs">
              {{ assetLabel(order.baseAsset) }} →
              {{ assetLabel(order.quoteAsset) }}
              <span class="text-muted-foreground">
                ({{ CHAIN_LABELS[order.chain] }})
              </span>
            </td>
            <td class="px-4 py-2 font-mono text-xs">
              {{ amountLabel(order) }}
            </td>
            <td class="px-4 py-2 font-mono text-xs">{{
              triggerLabel(order)
            }}</td>
            <td class="px-4 py-2">
              <OrderStatusBadge :status="order.status" />
            </td>
            <td class="px-4 py-2 text-muted-foreground text-xs">
              {{ formatTimestamp(order.createdAt) }}
            </td>
            <td class="px-4 py-2">
              <Button
                variant="ghost"
                size="icon"
                :aria-label="`Show executions for order ${order.id}`"
                :aria-expanded="expandedOrderId === order.id"
                @click="$emit('toggle-executions', order.id)"
              >
                <List aria-hidden="true" class="h-4 w-4" />
              </Button>
              
              <!-- Task 3.2: Cancel order button -->
              <Button
                v-if="order.status === 'pending' || order.status === 'active'"
              <!-- Cancel order button -->
              <Button
                v-if="order.status === 'pending_approval' || order.status === 'open'"
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
                @click="$emit('cancel-order', order.id)"
              >
                <X aria-hidden="true" class="h-4 w-4" />
              </Button>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
