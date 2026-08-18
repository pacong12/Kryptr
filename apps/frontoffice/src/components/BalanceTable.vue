<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ChainId, WalletBalance } from '@kryptr/shared-types';
import { Badge } from '@kryptr/shared-ui/vue/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@kryptr/shared-ui/vue/table';
import { Alert, AlertDescription, AlertTitle } from '@kryptr/shared-ui/vue/alert';
import { TriangleAlert, TrendingDown } from '@lucide/vue';
import {
  CHAIN_LABELS,
  NATIVE_DECIMALS,
  NATIVE_SYMBOLS,
  formatUnits,
  shortAddress,
} from '@/lib/format';
import { useBalances } from '@/composables/useBalances';

const props = defineProps<{
  walletId: string;
  /** Chains the wallet declares; used to spot chains the reader missed. */
  chains: ChainId[];
}>();

// Task 2.1: Real-time balance updates
const intervalRef = ref<number | null>(null);
const lastUpdated = ref<Date | null>(null);
const refreshInterval = 5000; // 5 seconds per spec

// Task 2.1: Currency toggle feature
type CurrencyView = 'native' | 'usd';
const currencyView = ref<CurrencyView>('native');

const { balances, loading, error, refresh } = useBalances(() => props.walletId);

// Watch for wallet ID changes to reset polling
watch(() => props.walletId, () => {
  stopPolling();
  void refresh();
  startPolling();
});

// Start automatic polling on mount
onMounted(() => {
  void refresh();
  startPolling();
});

// Stop polling when component unmounts
onBeforeUnmount(() => {
  stopPolling();
});

function startPolling(): void {
  if (intervalRef.value) return; // Already running
  
  // Initial fetch
  void refresh();
  
  // Set up polling
  intervalRef.value = window.setInterval(async () => {
    await refresh();
    lastUpdated.value = new Date();
  }, refreshInterval);
}

function stopPolling(): void {
  if (intervalRef.value) {
    window.clearInterval(intervalRef.value);
    intervalRef.value = null;
  }
}

function toggleCurrency(): void {
  currencyView.value = currencyView.value === 'native' ? 'usd' : 'native';
}

const rows = computed(() => {
  const rates = {
    ETH: 2345.67, // Placeholder - should come from price feed API
    USDC: 1.0,
    DAI: 1.0,
  };

  return props.balances.flatMap((balance) => {
    const nativeRow = {
      key: `${balance.walletId}:${balance.chain}:native`,
      asset: NATIVE_SYMBOLS[balance.chain],
      chain: balance.chain,
      amount: formatUnits(balance.nativeBalance, NATIVE_DECIMALS),
      contract: null,
      native: true,
      usdValue: parseFloat(formatUnits(balance.nativeBalance, NATIVE_DECIMALS)) * rates[NATIVE_SYMBOLS[balance.chain]],
    };
    
    const tokenRows = balance.tokens.map((token) => ({
      key: `${balance.walletId}:${balance.chain}:${token.contractAddress ?? token.symbol}`,
      asset: token.symbol,
      chain: balance.chain,
      amount: formatUnits(token.amount, token.decimals),
      contract: token.contractAddress,
      native: false,
      usdValue: parseFloat(formatUnits(token.amount, token.decimals)) * (rates[token.symbol] || 1),
    }));
    
    return [nativeRow, ...tokenRows];
  });
});

const rowsWithLowBalanceWarning = computed(() => {
  return rows.value.map(row => ({
    ...row,
    lowBalance: row.native && parseFloat(row.amount) < 0.1, // Threshold: < 0.1 ETH
  }));
});

/**
 * Chains the wallet declares but the API returned no balance entry for —
 * a partial chain-reader failure. We render a note row and NEVER fabricate
 * zeros for them.
 */
const missingChains = computed(() =>
  props.chains.filter(
    (chain) => !props.balances.some((balance) => balance.chain === chain),
  ),
);

/**
 * A wallet holding only zeros holds nothing worth tabling — show the empty
 * state instead of a wall of 0 rows. (Real zeros, never fabricated ones.)
 */
const holdsAnything = computed(() =>
  props.balances.some(
    (balance) =>
      balance.nativeBalance !== '0' ||
      balance.tokens.some((token) => token.amount !== '0'),
  ),
);

// Total USD value across all assets
const totalUsdValue = computed(() => {
  if (currencyView.value !== 'usd') return null;
  return rowsWithLowBalanceWarning.value.reduce((sum, row) => sum + row.usdValue, 0).toFixed(2);
});

// Low balance count warning
const lowBalanceCount = computed(() => 
  rowsWithLowBalanceWarning.value.filter(r => r.lowBalance).length
);
</script>

<template>
  <div class="space-y-4">
    <!-- Task 2.1: Low balance warning banner -->
    <Alert v-if="lowBalanceCount > 0" variant="destructive" class="animate-in fade-in">
      <TriangleAlert class="h-4 w-4" />
      <AlertTitle>Low Balance Alert</AlertTitle>
      <AlertDescription>
        {{ lowBalanceCount }} asset(s) below threshold (< 0.1 ETH equivalent). Consider transferring more funds or withdrawing excess.
      </AlertDescription>
    </Alert>

    <!-- Task 2.1: Balance dashboard header with controls -->
    <Card>
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-lg font-semibold">Wallet Balances</CardTitle>
        <div class="flex items-center gap-2">
          <!-- Task 2.1: Currency toggle button -->
          <Button
            variant="outline"
            size="sm"
            @click="toggleCurrency"
            class="gap-2"
          >
            <TrendingDown class="h-4 w-4" />
            {{ currencyView === 'native' ? 'Show in USD' : 'Show in Native' }}
          </Button>
          
          <!-- Task 2.1: Refresh indicator -->
          <Badge v-if="lastUpdated" variant="secondary" class="text-xs">
            Updated: {{ lastUpdated.toLocaleTimeString() }}
          </Badge>
          <Badge v-else-if="loading" variant="secondary" class="text-xs animate-pulse">
            Updating...
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div class="flex items-center justify-between mb-2">
          <p class="text-sm text-muted-foreground">
            Last updated: {{ lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never' }}
          </p>
          <p v-if="totalUsdValue && currencyView === 'usd'" class="text-sm font-semibold text-green-600">
            Total Value: ${{{ totalUsdValue }}}
          </p>
        </div>

        <Table v-if="holdsAnything && !loading">
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Chain</TableHead>
              <TableHead class="text-right" :class="{'cursor-pointer hover:underline': currencyView === 'usd'}" @click="toggleCurrency">
                Balance <span class="ml-1 text-xs text-muted-foreground">(click to switch)</span>
              </TableHead>
              <TableHead>Contract</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-for="row in rowsWithLowBalanceWarning" :key="row.key">
              <TableRow :class="{
                'bg-red-50 border-l-4 border-l-red-500': row.lowBalance,
              }">
                <TableCell class="font-medium">
                  <span class="flex items-center gap-2">
                    {{ row.asset }}
                    <Badge v-if="row.native" variant="secondary">native</Badge>
                    <Badge v-if="row.lowBalance" variant="destructive" class="text-xs">
                      Low
                    </Badge>
                  </span>
                </TableCell>
                <TableCell>{{ CHAIN_LABELS[row.chain] }}</TableCell>
                <TableCell class="text-right font-mono" :class="{'hover:text-blue-600': currencyView === 'usd'}">
                  <template v-if="currencyView === 'native'">
                    {{ row.amount }}
                  </template>
                  <template v-else-if="row.usdValue !== undefined">
                    ${{ row.usdValue.toFixed(2) }}
                  </template>
                </TableCell>
                <TableCell class="text-muted-foreground font-mono">
                  {{ row.contract ? shortAddress(row.contract) : '—' }}
                </TableCell>
              </TableRow>
            </template>
            
            <!-- Missing chains warning rows -->
            <template v-for="chain in missingChains" :key="`missing:${chain}`">
              <TableRow>
                <TableCell :colspan="4">
                  <span class="text-muted-foreground flex items-center gap-2 text-sm">
                    <TriangleAlert class="size-4" aria-hidden="true" />
                    No balance data for {{ CHAIN_LABELS[chain] }} — the chain reader did not answer for this chain. Nothing is fabricated.
                  </span>
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>

        <!-- Loading state -->
        <div v-else-if="loading" class="py-8 space-y-2">
          <Skeleton class="h-4 w-3/4" />
          <Skeleton class="h-4 w-1/2" />
          <Skeleton class="h-4 w-full" />
          <p class="text-xs text-muted-foreground pt-2">
            Fetching balances...
          </p>
        </div>

        <!-- Empty state -->
        <TableEmpty
          v-if="!holdsAnything && missingChains.length === 0 && !loading"
          :colspan="4"
        >
          <div class="text-muted-foreground space-y-1 py-6 text-sm">
            <p class="font-medium">No assets to show</p>
            <p>This wallet doesn't hold anything on the loaded chains yet.</p>
          </div>
        </TableEmpty>
      </CardContent>
    </Card>

    <!-- Error handling -->
    <Alert v-if="error" variant="destructive">
      <TriangleAlert class="h-4 w-4" />
      <AlertTitle>Balance fetch failed</AlertTitle>
      <AlertDescription>
        Could not retrieve wallet balances. Please try refreshing manually.
      </AlertDescription>
    </Alert>
  </div>
</template>

<style scoped>
.card:hover .text-right {
  transition: color 0.2s ease-in-out;
}
</style>
