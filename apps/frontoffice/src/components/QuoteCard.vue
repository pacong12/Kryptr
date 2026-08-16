<script setup lang="ts">
import { computed } from 'vue';
import type {
  ApiError,
  ChainId,
  SwapQuote,
  WalletBalance,
} from '@kryptr/shared-types';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kryptr/shared-ui/vue/alert';
import { Badge } from '@kryptr/shared-ui/vue/badge';
import { Button } from '@kryptr/shared-ui/vue/button';
import { Skeleton } from '@kryptr/shared-ui/vue/skeleton';
import { Info, RefreshCw, TriangleAlert } from '@lucide/vue';
import type { QuoteState } from '@/composables/useQuote';
import { formatUnits, resolveAssetMeta } from '@/lib/format';

const props = defineProps<{
  state: QuoteState;
  quote: SwapQuote | null;
  secondsLeft: number;
  error: ApiError | null;
  chain: ChainId;
  /** Wallet balances used to resolve asset symbols/decimals for display. */
  balances: WalletBalance[];
}>();

const emit = defineEmits<{
  (event: 'refresh'): void;
}>();

/** A missing aggregator key never succeeds on retry — say so, don't tease. */
const unconfigured = computed(
  () => props.error?.code === 'aggregator_unconfigured',
);

function formatAmount(raw: string, address: `0x${string}` | null): string {
  const meta = resolveAssetMeta(props.chain, address, props.balances);
  if (!meta) return raw;
  return `${formatUnits(raw, meta.decimals)} ${meta.symbol}`;
}

function formatPrice(quote: SwapQuote): string {
  const inMeta = resolveAssetMeta(props.chain, quote.assetIn, props.balances);
  const outMeta = resolveAssetMeta(props.chain, quote.assetOut, props.balances);
  if (!inMeta || !outMeta) return String(quote.price);
  return `1 ${inMeta.symbol} ≈ ${quote.price.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${outMeta.symbol}`;
}
</script>

<template>
  <div class="space-y-3" aria-live="polite">
    <div v-if="state === 'quoting'" class="space-y-2">
      <Skeleton class="h-5 w-2/3" />
      <Skeleton class="h-5 w-1/2" />
      <Skeleton class="h-5 w-3/4" />
      <p class="text-muted-foreground text-sm">Fetching a live quote…</p>
    </div>

    <template v-else-if="state === 'error'">
      <!-- Unconfigured = deployment gap; retry can never succeed. -->
      <Alert v-if="unconfigured" data-testid="quote-unconfigured">
        <Info aria-hidden="true" />
        <AlertTitle>Live quotes not available</AlertTitle>
        <AlertDescription>
          This deployment has no swap aggregator configured, so we can't fetch a
          real quote. Kryptr never fabricates quotes, so swap is paused.
        </AlertDescription>
      </Alert>

      <!-- Transient failure = the service may recover; offer a retry. -->
      <Alert v-else variant="destructive" data-testid="quote-error">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>No quote available</AlertTitle>
        <AlertDescription>
          {{ error?.message ?? 'The quoting service did not respond.' }}
          Kryptr never fabricates quotes — retry when the service is reachable.
        </AlertDescription>
        <Button
          variant="outline"
          size="sm"
          type="button"
          class="mt-2 w-fit"
          @click="emit('refresh')"
        >
          <RefreshCw data-icon="inline-start" aria-hidden="true" />
          Retry quote
        </Button>
      </Alert>
    </template>

    <template v-else-if="quote">
      <div class="flex flex-wrap items-center gap-2">
        <Badge v-if="state === 'expired'" variant="destructive"
          >Quote expired</Badge
        >
        <Badge v-else-if="secondsLeft <= 10" variant="destructive">
          Expires in {{ secondsLeft }}s
        </Badge>
        <Badge v-else variant="secondary">Expires in {{ secondsLeft }}s</Badge>
        <Badge variant="outline">source: {{ quote.source }}</Badge>
        <Badge variant="outline">slippage {{ quote.slippageBps / 100 }}%</Badge>
      </div>

      <dl class="grid gap-2 text-sm">
        <div class="flex items-center justify-between gap-2">
          <dt class="text-muted-foreground">You sell</dt>
          <dd class="font-medium">
            {{ formatAmount(quote.amountIn, quote.assetIn) }}
          </dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-muted-foreground">You receive (expected)</dt>
          <dd class="font-medium">
            {{ formatAmount(quote.amountOut, quote.assetOut) }}
          </dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-muted-foreground">Minimum received</dt>
          <dd class="font-mono">
            {{ formatAmount(quote.minAmountOut, quote.assetOut) }}
          </dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-muted-foreground">Price</dt>
          <dd class="font-mono">{{ formatPrice(quote) }}</dd>
        </div>
        <div
          v-if="quote.fees && quote.fees.length > 0"
          class="flex items-center justify-between gap-2"
        >
          <dt class="text-muted-foreground">Fees</dt>
          <dd class="font-mono">
            {{
              quote.fees
                .map((fee) => formatAmount(fee.amount, fee.asset))
                .join(' + ')
            }}
          </dd>
        </div>
        <div
          v-if="quote.route.length > 0"
          class="flex items-center justify-between gap-2"
        >
          <dt class="text-muted-foreground">Route</dt>
          <dd>{{ quote.route.map((hop) => hop.venue).join(' → ') }}</dd>
        </div>
      </dl>

      <div v-if="state === 'expired'" class="space-y-2">
        <p class="text-muted-foreground text-sm">
          This quote has lapsed and can no longer be submitted to the gate.
        </p>
        <Button
          variant="outline"
          size="sm"
          type="button"
          @click="emit('refresh')"
        >
          <RefreshCw data-icon="inline-start" aria-hidden="true" />
          Get a fresh quote
        </Button>
      </div>
    </template>

    <p v-else class="text-muted-foreground text-sm">
      Pick a pair and an amount — the quote appears here. Quotes are live,
      expire quickly, and are never mocked.
    </p>
  </div>
</template>
