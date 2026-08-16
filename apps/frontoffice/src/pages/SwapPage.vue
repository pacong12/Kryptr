<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ChainId, QuoteRequest, SwapQuote } from '@kryptr/shared-types';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kryptr/shared-ui/vue/alert';
import { Badge } from '@kryptr/shared-ui/vue/badge';
import { Button } from '@kryptr/shared-ui/vue/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/vue/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kryptr/shared-ui/vue/dialog';
import { Separator } from '@kryptr/shared-ui/vue/separator';
import { Skeleton } from '@kryptr/shared-ui/vue/skeleton';
import { Loader2, ShieldCheck, TriangleAlert } from '@lucide/vue';
import { toast } from 'vue-sonner';
import QuoteCard from '@/components/QuoteCard.vue';
import SwapForm from '@/components/SwapForm.vue';
import SwapResultPanel from '@/components/SwapResultPanel.vue';
import { useBalances } from '@/composables/useBalances';
import { useQuote } from '@/composables/useQuote';
import { useSwap } from '@/composables/useSwap';
import { useSignRequest } from '@/composables/useSignRequest';
import { useWallets } from '@/composables/useWallets';
import {
  CHAIN_LABELS,
  NATIVE_ASSET,
  parseUnits,
  resolveAssetMeta,
  shortAddress,
} from '@/lib/format';

const props = defineProps<{ walletId: string }>();

const {
  wallets,
  loading: walletsLoading,
  refresh: refreshWallets,
} = useWallets();
const {
  balances,
  loading: balancesLoading,
  mockMode,
  refresh: refreshBalances,
} = useBalances(() => props.walletId);
const {
  state: quoteState,
  quote,
  secondsLeft,
  error: quoteError,
  refresh: refreshQuote,
  clear: clearQuote,
} = useQuote(() => props.walletId);
const {
  submitting: swapSubmitting,
  decision: swapDecision,
  result: swapResult,
  preview: swapPreview,
  error: swapError,
  gateUnreachable,
  evaluate: evaluateSwap,
  reset: resetSwap,
} = useSwap();
const {
  requesting: signRequesting,
  signRequest,
  error: signRequestError,
  request: requestSignature,
  reset: resetSignRequest,
} = useSignRequest();

onMounted(() => {
  void refreshWallets();
  void refreshBalances();
});

const wallet = computed(
  () =>
    wallets.value.find((candidate) => candidate.id === props.walletId) ?? null,
);

const chain = ref<ChainId | null>(null);
const assetIn = ref<string>(NATIVE_ASSET);
const assetOut = ref<string>(NATIVE_ASSET);
const amount = ref('');
const reviewOpen = ref(false);
let defaultsApplied = false;

// Seed sensible defaults once the wallet and its balances arrive.
watch([wallet, balances], ([walletValue, balanceValue]) => {
  if (defaultsApplied || !walletValue || balancesLoading.value) return;
  chain.value = walletValue.chains[0] ?? null;
  const firstToken = balanceValue
    .filter((entry) => entry.chain === chain.value)
    .flatMap((entry) => entry.tokens)
    .find((token) => token.contractAddress !== null);
  if (firstToken?.contractAddress) assetOut.value = firstToken.contractAddress;
  defaultsApplied = true;
});

function toAddress(key: string): `0x${string}` | null {
  // Keys only ever come from NATIVE_ASSET or a token contractAddress.
  return key === NATIVE_ASSET ? null : (key as `0x${string}`);
}

const quoteParams = computed<Omit<QuoteRequest, 'walletId'> | null>(() => {
  if (!chain.value || assetIn.value === assetOut.value) return null;
  const inMeta = resolveAssetMeta(
    chain.value,
    toAddress(assetIn.value),
    balances.value,
  );
  if (!inMeta) return null;
  const raw = parseUnits(amount.value, inMeta.decimals);
  if (raw === null || raw <= 0n) return null;
  return {
    chain: chain.value,
    assetIn: toAddress(assetIn.value),
    assetOut: toAddress(assetOut.value),
    amount: raw.toString(),
  };
});

// Debounced auto-quote: the composable owns the fetch, the page owns triggers.
let quoteTimer: ReturnType<typeof setTimeout> | null = null;
watch(quoteParams, (params) => {
  if (quoteTimer !== null) clearTimeout(quoteTimer);
  quoteTimer = setTimeout(() => {
    if (params) void refreshQuote(params);
    else clearQuote();
  }, 400);
});

onUnmounted(() => {
  if (quoteTimer !== null) clearTimeout(quoteTimer);
});

// Any form change invalidates a previous gate decision (it is quote-bound).
watch([chain, assetIn, assetOut, amount], () => {
  resetSwap();
  resetSignRequest();
});

function flip(): void {
  [assetIn.value, assetOut.value] = [assetOut.value, assetIn.value];
}

function requite(): void {
  if (quoteParams.value) void refreshQuote(quoteParams.value);
}

const canReview = computed(
  () => quoteState.value === 'ready' && quote.value !== null,
);

function confirmSwap(): void {
  const activeQuote = quote.value;
  const activeChain = chain.value;
  if (!activeQuote || !activeChain || quoteState.value !== 'ready') return;
  reviewOpen.value = false;
  void submitSwap(activeQuote, activeChain);
}

async function submitSwap(activeQuote: SwapQuote, activeChain: ChainId) {
  await evaluateSwap(props.walletId, activeChain, activeQuote);
  if (gateUnreachable.value) {
    toast.error('Security gate unreachable — swap blocked');
  } else if (swapResult.value === 'approved') {
    toast.success('Approved — ready to sign');
  } else if (swapResult.value === 'needs_human_approval') {
    toast.info('Needs human approval', {
      description: swapDecision.value?.reason,
    });
  } else if (swapResult.value === 'rejected') {
    toast.error('Swap rejected', {
      description: swapDecision.value?.reason,
    });
  } else if (swapError.value) {
    toast.error(swapError.value.message);
  }
}

function adjust(): void {
  resetSwap();
  resetSignRequest();
  clearQuote();
  amount.value = '';
}

function handleSignRequest(): void {
  const intentId = swapDecision.value?.intentId;
  if (intentId) void requestSignature(intentId);
}
</script>

<template>
  <div class="space-y-8">
    <div class="space-y-1">
      <h2 class="text-xl font-semibold">Swap assets</h2>
      <p class="text-muted-foreground text-sm">
        Quotes are live and expire quickly. Every swap passes the security gate
        before anything could be signed.
      </p>
    </div>

    <Skeleton
      v-if="(walletsLoading && !wallet) || balancesLoading"
      class="h-80 w-full"
    />

    <Alert v-else-if="!wallet" variant="destructive">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>Wallet not found</AlertTitle>
      <AlertDescription>
        Wallet {{ walletId }} was not found.
      </AlertDescription>
    </Alert>

    <template v-else>
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between gap-2">
            <CardTitle class="text-base">New swap</CardTitle>
            <div class="flex items-center gap-2">
              <Badge v-if="mockMode" variant="secondary">mock balances</Badge>
              <Badge v-if="chain" variant="outline">
                {{ CHAIN_LABELS[chain] }}
              </Badge>
            </div>
          </div>
          <CardDescription class="font-mono">
            {{ shortAddress(wallet.address) }}
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <SwapForm
            :chains="wallet.chains"
            :chain="chain ?? wallet.chains[0]"
            :balances="balances"
            :asset-in="assetIn"
            :asset-out="assetOut"
            :amount="amount"
            @update:chain="(value) => (chain = value)"
            @update:asset-in="(value) => (assetIn = value)"
            @update:asset-out="(value) => (assetOut = value)"
            @update:amount="(value) => (amount = value)"
            @flip="flip"
          />

          <Separator />

          <QuoteCard
            :state="quoteState"
            :quote="quote"
            :seconds-left="secondsLeft"
            :error="quoteError"
            :chain="chain ?? wallet.chains[0]"
            :balances="balances"
            @refresh="requite"
          />

          <div class="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              :disabled="!canReview || swapSubmitting"
              @click="reviewOpen = true"
            >
              <ShieldCheck data-icon="inline-start" aria-hidden="true" />
              Review swap
            </Button>
            <p class="text-muted-foreground text-sm">
              Reviewing confirms the exact quote against the security gate.
            </p>
          </div>
        </CardContent>
      </Card>

      <div aria-live="polite" class="space-y-4">
        <Skeleton v-if="swapSubmitting" class="h-40 w-full" />
        <SwapResultPanel
          v-else-if="swapDecision"
          :decision="swapDecision"
          :preview="swapPreview"
          :sign-request="signRequest"
          :sign-requesting="signRequesting"
          :sign-request-error="signRequestError"
          @adjust="adjust"
          @sign="handleSignRequest"
        />
        <Alert v-else-if="gateUnreachable" variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Security gate unreachable — swap blocked.</AlertTitle>
          <AlertDescription>
            Kryptr never lets an intent bypass the gate. Retry when the API is
            available.
          </AlertDescription>
        </Alert>
        <Alert v-else-if="swapError" variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Swap failed</AlertTitle>
          <AlertDescription>{{ swapError.message }}</AlertDescription>
        </Alert>
      </div>

      <Dialog v-model:open="reviewOpen">
        <DialogContent class="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review swap</DialogTitle>
            <DialogDescription>
              Confirming sends this exact quote to the security gate. Wave 2
              stops at the decision — nothing is signed.
            </DialogDescription>
          </DialogHeader>
          <QuoteCard
            :state="quoteState"
            :quote="quote"
            :seconds-left="secondsLeft"
            :error="quoteError"
            :chain="chain ?? wallet.chains[0]"
            :balances="balances"
            @refresh="requite"
          />
          <DialogFooter>
            <Button
              type="button"
              :disabled="quoteState !== 'ready' || swapSubmitting"
              @click="confirmSwap"
            >
              <Loader2
                v-if="swapSubmitting"
                data-icon="inline-start"
                class="animate-spin"
                aria-hidden="true"
              />
              <template v-if="quoteState === 'expired'">Quote expired</template>
              <template v-else>Confirm — send to security gate</template>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </template>
  </div>
</template>
