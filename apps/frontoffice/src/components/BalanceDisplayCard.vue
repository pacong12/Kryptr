<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Badge } from '@kryptr/shared-ui/vue/badge';
import { Button } from '@kryptr/shared-ui/vue/button';
import { CardContent, CardHeader, CardTitle } from '@kryptr/shared-ui/vue/card';
import { Skeleton } from '@kryptr/shared-ui/vue/skeleton';
import { TriangleAlert } from '@lucide/vue';
import { toast } from 'vue-sonner';
import { useBalance } from '@/composables/useBalance';

const props = defineProps<{
  walletId: string;
}>();

/** Track current chain selection */
const selectedChain = ref<'base' | 'robinhood'>('base');

/** Simple chain name mapping */
const CHAIN_NAME_MAP: Record<'base' | 'robinhood', string> = {
  base: 'Base',
  robinhood: 'Robinhood Chain',
};

/** Fetch balances via composable */
const balance = useBalance(props.walletId);

onMounted(() => {
  void balance.refreshBalances();
});

/** Current chain display name */
const currentChainName = computed(() => CHAIN_NAME_MAP[selectedChain.value]);
</script>

<template>
  <div class="grid gap-4">
    <!-- Chain selector -->
    <div class="flex items-center gap-2 rounded-lg border p-2">
      <button
        v-for="chain in ['base', 'robinhood'] as const"
        :key="chain"
        :class="[
          'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
          selectedChain === chain
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-accent',
        ]"
        @click="selectedChain = chain"
      >
        {{ CHAIN_NAME_MAP[chain] }}
      </button>
    </div>

    <!-- Loading state -->
    <div v-if="balance.loadingBalances" data-testid="balance-loading-skeleton">
      <Skeleton class="h-8 w-full" />
      <Skeleton class="h-4 w-32 mt-2" />
    </div>

    <!-- Error state with retry button -->
    <div
      v-else-if="!balance.balancesReady && balance.balanceError"
      class="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3"
      role="alert"
      data-testid="balance-error-state"
    >
      <TriangleAlert
        class="size-4 shrink-0 text-destructive"
        aria-hidden="true"
      />
      <div class="grid gap-1 flex-1">
        <p class="font-medium text-destructive">Failed to load balances</p>
        <p class="text-muted-foreground text-xs">
          {{ balance.balanceError.message }}
        </p>
        <Button
          variant="outline"
          size="sm"
          class="mt-1 w-fit"
          data-testid="balance-retry-btn"
          @click="void balance.refreshBalances()"
        >
          Retry
        </Button>
      </div>
    </div>

    <!-- Success state -->
    <div v-else-if="balance.balancesReady">
      <div class="grid gap-3 sm:grid-cols-2">
        <!-- ETH Balance -->
        <div
          class="rounded-lg border bg-card p-4"
          data-testid="eth-balance-card"
        >
          <div class="flex items-center justify-between">
            <Badge variant="secondary">ETH</Badge>
            <Badge variant="outline">{{ currentChainName }}</Badge>
          </div>
          <p class="mt-3 text-2xl font-bold">
            {{ balance.balances?.ETH?.[selectedChain] || '0' }}
          </p>
          <p class="text-muted-foreground text-xs">
            ~{{ (parseFloat(balance.balances?.ETH?.[selectedChain] ?? '0') * 3000).toFixed(2) }} USD
          </p>
        </div>

        <!-- USDC Balance -->
        <div
          class="rounded-lg border bg-card p-4"
          data-testid="usdc-balance-card"
        >
          <div class="flex items-center justify-between">
            <Badge variant="secondary">USDC</Badge>
            <Badge variant="outline">{{ currentChainName }}</Badge>
          </div>
          <p class="mt-3 text-2xl font-bold">
            {{ balance.balances?.USDC?.[selectedChain] || '0' }}
          </p>
          <p class="text-muted-foreground text-xs">
            ~{{ (parseFloat(balance.balances?.USDC?.[selectedChain] ?? '0')).toFixed(2) }} USD
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
button:hover:not(:disabled) {
  opacity: 0.9;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
