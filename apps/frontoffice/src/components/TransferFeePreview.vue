<script setup lang="ts">
import { CardContent } from '@kryptr/shared-ui/vue/card';
import { Separator } from '@kryptr/shared-ui/vue/separator';

interface FeeRecipient {
  address: string;
  bps: number;
}

defineProps<{
  feeBps: number;
  feeRecipients: string[];
}>();

// Convert BPS to percentage (10000 = 100%)
const feePercentage = (bps: number) => ((bps / 10000) * 100).toFixed(2);

const formattedRecipients = feeRecipients.map(addr => ({
  address: addr.length === 42 ? addr : '0x...' + addr.slice(-8),
  bps: Math.round((parseFloat(feePercentage(props.feeBps)) * 100) / feeRecipients.length),
}));
</script>

<template>
  <CardContent class="space-y-3">
    <Separator />
    
    <div class="grid gap-2 text-sm">
      <div class="flex items-center justify-between">
        <p class="text-muted-foreground text-xs">Platform fee</p>
        <p class="font-medium">{{ feePercentage(feeBps) }}%</p>
      </div>

      <div v-if="feeRecipients.length > 0" class="grid gap-1.5">
        <p class="text-muted-foreground text-xs">Fee recipients (split proportionally)</p>
        <div
          v-for="(recipient, idx) in feeRecipients"
          :key="idx"
          class="flex items-center justify-between rounded-md border bg-accent p-2 text-xs"
        >
          <span class="font-mono">{{ recipient }}</span>
          <span class="font-medium">{{ feePercentage(feeBps) }}%</span>
        </div>
      </div>

      <div class="grid gap-0.5 rounded-md border p-2 text-xs">
        <p class="text-muted-foreground text-xs">Total cost estimate</p>
        <p class="font-medium">
          Platform fee only — gas paid separately by sender
        </p>
      </div>
    </div>
  </CardContent>
</template>
