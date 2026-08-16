<script setup lang="ts">
import type {
  ApiError,
  ExecutionStatus,
  OrderExecution,
} from '@kryptr/shared-types';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kryptr/shared-ui/vue/alert';
import { Badge } from '@kryptr/shared-ui/vue/badge';
import { Skeleton } from '@kryptr/shared-ui/vue/skeleton';
import { TriangleAlert } from '@lucide/vue';
import type { OrderExecutionsState } from '@/composables/useOrderExecutions';
import { formatTimestamp } from '@/lib/format';
import { workerErrorMeta } from '@/lib/workerErrors';

defineProps<{
  state: OrderExecutionsState;
  executions: OrderExecution[];
  error: ApiError | null;
}>();

/** Frozen `EXECUTION_STATUSES` → label + badge variant. */
const EXECUTION_STATUS_META: Record<
  ExecutionStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'outline' | 'destructive';
  }
> = {
  claimed: { label: 'Claimed', variant: 'default' },
  quoted: { label: 'Quoted', variant: 'default' },
  submitted: { label: 'Submitted', variant: 'default' },
  confirmed: { label: 'Confirmed', variant: 'secondary' },
  gate_rejected: { label: 'Gate rejected', variant: 'destructive' },
  failed: { label: 'Failed', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'outline' },
};
</script>

<template>
  <div class="grid gap-3" data-testid="order-executions-panel">
    <div v-if="state === 'loading'" class="grid gap-2">
      <Skeleton class="h-8 w-full" />
      <Skeleton class="h-8 w-2/3" />
    </div>

    <Alert
      v-else-if="state === 'error'"
      variant="destructive"
      data-testid="executions-load-error"
    >
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>{{ workerErrorMeta(error).title }}</AlertTitle>
      <AlertDescription>
        {{ workerErrorMeta(error).message }}
        <span class="font-mono">(code: {{ error?.code }})</span>
      </AlertDescription>
    </Alert>

    <template v-else-if="state === 'ready'">
      <p class="text-muted-foreground text-xs">
        Executions stop at the unsigned dry-run boundary — nothing is broadcast
        on-chain yet.
      </p>

      <p v-if="executions.length === 0" class="text-muted-foreground text-sm">
        No executions claimed yet — the worker has not claimed a slot for this
        order.
      </p>

      <ul v-else class="grid gap-2">
        <li
          v-for="execution in executions"
          :key="execution.id"
          class="grid gap-1 rounded-lg border p-3 text-sm"
          :data-execution-id="execution.id"
        >
          <div class="flex flex-wrap items-center gap-2">
            <Badge
              :variant="EXECUTION_STATUS_META[execution.status].variant"
              :data-execution-status="execution.status"
            >
              {{ EXECUTION_STATUS_META[execution.status].label }}
            </Badge>
            <span class="font-mono text-xs">slot {{ execution.slotKey }}</span>
          </div>
          <p class="text-muted-foreground text-xs">
            Claimed {{ formatTimestamp(execution.claimedAt) }}
            <template v-if="execution.finishedAt !== null">
              · finished {{ formatTimestamp(execution.finishedAt) }}
            </template>
            <template v-else>· in flight</template>
          </p>
          <p v-if="execution.detail" class="font-mono text-xs">
            {{ execution.detail }}
          </p>
          <p
            v-if="execution.intentId"
            class="text-muted-foreground font-mono text-xs"
          >
            intent {{ execution.intentId }}
          </p>
        </li>
      </ul>
    </template>
  </div>
</template>
