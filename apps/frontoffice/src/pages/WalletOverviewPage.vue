<script setup lang="ts">
import { computed, onMounted } from 'vue';
import type { TransactionIntent } from '@kryptr/shared-types';
import { Badge } from '@kryptr/shared-ui/vue/badge';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kryptr/shared-ui/vue/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/vue/card';
import { Separator } from '@kryptr/shared-ui/vue/separator';
import { Skeleton } from '@kryptr/shared-ui/vue/skeleton';
import { ShieldCheck, TriangleAlert } from '@lucide/vue';
import BalanceTable from '@/components/BalanceTable.vue';
import SecurityDecisionCard from '@/components/SecurityDecisionCard.vue';
import TransferForm from '@/components/TransferForm.vue';
import { useBalances } from '@/composables/useBalances';
import { useTransfer } from '@/composables/useTransfer';
import { useWallets } from '@/composables/useWallets';

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
        <Alert v-else-if="error" variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Balances unavailable</AlertTitle>
          <AlertDescription>{{ error.message }}</AlertDescription>
        </Alert>
        <BalanceTable
          v-else
          :balances="balances"
          :chains="wallet?.chains ?? []"
        />
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
            <Alert v-else-if="gateUnreachable" variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle
                >Security gate unreachable — transfer blocked.</AlertTitle
              >
              <AlertDescription>
                Kryptr never lets an intent bypass the gate. Retry when the API
                is available.
              </AlertDescription>
            </Alert>
            <Alert v-else-if="transferError" variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Transfer failed</AlertTitle>
              <AlertDescription>{{ transferError.message }}</AlertDescription>
            </Alert>
            <p
              v-else
              class="text-muted-foreground flex items-center gap-1.5 text-sm"
            >
              <ShieldCheck class="size-4" aria-hidden="true" />
              Waiting for an intent — decisions appear here.
            </p>
          </div>
        </template>

        <Alert v-else variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Wallet not found</AlertTitle>
          <AlertDescription>
            Wallet {{ walletId }} was not found.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  </div>
</template>
