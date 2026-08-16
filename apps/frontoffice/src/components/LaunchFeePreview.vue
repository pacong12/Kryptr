<script setup lang="ts">
import { computed } from 'vue';
import type { FeeBps, FeeRecipients } from '@kryptr/shared-types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kryptr/shared-ui/vue/table';
import {
  bpsToDollarsPer100,
  bpsToPercent,
  feePreviewRows,
  totalFeeBps,
} from '@/lib/feePreview';
import { shortAddress } from '@/lib/format';

const props = defineProps<{
  feeBps: FeeBps;
  feeRecipients: FeeRecipients;
}>();

/**
 * Cost-per-$100 preview. Q1 ruling: integer-bps mirrors are the source of
 * truth — every number here is pure integer arithmetic; the float shares
 * never touch money math.
 */
const rows = computed(() => feePreviewRows(props.feeBps));
const totalBps = computed(() => totalFeeBps(props.feeBps));
</script>

<template>
  <div class="grid gap-3">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Recipient</TableHead>
          <TableHead>Address</TableHead>
          <TableHead class="text-right">Fee</TableHead>
          <TableHead class="text-right">Per $100</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow
          v-for="row in rows"
          :key="row.key"
          :data-fee-recipient="row.key"
        >
          <TableCell>{{ row.label }}</TableCell>
          <TableCell class="font-mono text-xs">
            {{ shortAddress(feeRecipients[row.key]) }}
          </TableCell>
          <TableCell class="text-right font-mono text-xs">
            {{ bpsToPercent(row.bps) }}
          </TableCell>
          <TableCell class="text-right font-mono text-xs">
            {{ bpsToDollarsPer100(row.bps) }}
          </TableCell>
        </TableRow>
        <TableRow data-testid="fee-preview-total">
          <TableCell class="font-medium">Total launch fee</TableCell>
          <TableCell />
          <TableCell class="text-right font-mono text-xs font-medium">
            {{ bpsToPercent(totalBps) }}
          </TableCell>
          <TableCell
            class="text-right font-mono text-xs font-medium"
            data-testid="fee-preview-cost-per-100"
          >
            {{ bpsToDollarsPer100(totalBps) }}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <p class="text-muted-foreground text-xs">
      Computed from the integer fee-bps mirrors — float shares never touch money
      math.
    </p>
  </div>
</template>
