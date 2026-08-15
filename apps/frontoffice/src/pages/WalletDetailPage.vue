<script setup lang="ts">
import { computed, onMounted } from 'vue';
import type { TransactionIntent } from '@kryptr/shared-types';
import { Badge } from '@kryptr/shared-ui/vue/badge';
import { Button } from '@kryptr/shared-ui/vue/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/vue/card';
import { Separator } from '@kryptr/shared-ui/vue/separator';
import { Skeleton } from '@kryptr/shared-ui/vue/skeleton';
import { ArrowLeft, ShieldCheck } from '@lucide/vue';
import BalanceTable from '@/components/BalanceTable.vue';
import SecurityDecisionCard from '@/components/SecurityDecisionCard.vue';
import TransferForm from '@/components/TransferForm.vue';
import { useBalances } from '@/composables/useBalances';
import { useTransfer } from '@/composables/useTransfer';
import { useWallets } from '@/composables/useWallets';
import { CHAIN_LABELS, shortAddress } from '@/lib/format';

const props = defineProps<{ walletId: string }>();

const { balances, loading, mockMode, error, refresh } = useBalances(
  () => props.walletId,
);
const {
  wallets,
  loading: walletsLoading,
  refresh: refreshWallets,
} = useWallets();
const {
  submitting,
  decision,
  error: transferError,
  gateUnreachable,
  evaluate,
} = useTransfer();

onMounted(() => {
  void refresh();
  void refreshWallets();
});

const wallet = computed(
  () =>
    wallets.value.find((candidate) => candidate.id === props.walletId) ?? null,
);
const assets = computed(() =>
  balances.value.flatMap((balance) => balance.tokens),
);

function handleSubmit(intent: TransactionIntent): void {
  void evaluate(intent);
}
</script>

<template>
  <div class="space-y-8">
    <div class="space-y-3">
      <Button variant="ghost" size="sm" as-child>
        <RouterLink to="/">
          <ArrowLeft data-icon="inline-start" aria-hidden="true" />
          All wallets
        </RouterLink>
      </Button>
      <div class="space-y-1">
        <h1 class="text-2xl font-bold">Wallet balances</h1>
        <p class="text-muted-foreground font-mono text-sm">{{ walletId }}</p>
        <div v-if="wallet" class="flex flex-wrap items-center gap-2 pt-1">
          <span class="font-mono text-sm">
            {{ shortAddress(wallet.address) }}
          </span>
          <Badge v-for="chain in wallet.chains" :key="chain" variant="outline">
            {{ CHAIN_LABELS[chain] }}
          </Badge>
        </div>
      </div>
    </div>

    <Card>
      <CardHeader>
        <div class="flex items-center justify-between gap-2">
          <CardTitle class="text-base">Balances</CardTitle>
          <Badge v-if="mockMode" variant="secondary">mock data</Badge>
        </div>
        <CardDescription>Native and token holdings per chain.</CardDescription>
      </CardHeader>
      <CardContent>
        <Skeleton v-if="loading" class="h-40 w-full" />
        <p v-else-if="error" role="alert" class="text-destructive text-sm">
          {{ error.message }}
        </p>
        <BalanceTable v-else :balances="balances" />
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="text-base">Send a transfer</CardTitle>
        <CardDescription>
          Transfers leave as structured intents and must pass the security gate
          before anything is signed.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <Skeleton v-if="walletsLoading && !wallet" class="h-64 w-full" />

        <template v-else-if="wallet">
          <TransferForm
            :wallet="wallet"
            :assets="assets"
            @submit="handleSubmit"
          />
          <Separator />
          <div class="space-y-4" aria-live="polite">
            <Skeleton v-if="submitting" class="h-32 w-full" />
            <SecurityDecisionCard v-else-if="decision" :decision="decision" />
            <div
              v-else-if="gateUnreachable"
              role="alert"
              class="text-destructive space-y-1 text-sm"
            >
              <p class="font-medium">
                Security gate unreachable — transfer blocked.
              </p>
              <p>
                Kryptr never lets an intent bypass the gate. Retry when the API
                is available.
              </p>
            </div>
            <p
              v-else-if="transferError"
              role="alert"
              class="text-destructive text-sm"
            >
              {{ transferError.message }}
            </p>
            <p
              v-else
              class="text-muted-foreground flex items-center gap-1.5 text-sm"
            >
              <ShieldCheck class="size-4" aria-hidden="true" />
              Waiting for an intent — decisions appear here.
            </p>
          </div>
        </template>

        <p v-else role="alert" class="text-destructive text-sm">
          Wallet {{ walletId }} was not found.
        </p>
      </CardContent>
    </Card>
  </div>
</template>
