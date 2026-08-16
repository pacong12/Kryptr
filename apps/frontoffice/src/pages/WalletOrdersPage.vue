<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import type { ChainId, OrderType } from '@kryptr/shared-types';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kryptr/shared-ui/vue/alert';
import { Button } from '@kryptr/shared-ui/vue/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/vue/card';
import { Skeleton } from '@kryptr/shared-ui/vue/skeleton';
import { RefreshCw, TriangleAlert } from '@lucide/vue';
import { toast } from 'vue-sonner';
import OrderForm from '@/components/OrderForm.vue';
import OrdersTable from '@/components/OrdersTable.vue';
import WorkerHealthBanner from '@/components/WorkerHealthBanner.vue';
import { useBalances } from '@/composables/useBalances';
import { useCreateOrder } from '@/composables/useCreateOrder';
import { useOrders } from '@/composables/useOrders';
import { useWallets } from '@/composables/useWallets';
import { NATIVE_ASSET, parseUnits, resolveAssetMeta } from '@/lib/format';
import { ORDERS_SOURCE_KEY } from '@/lib/orders';
import { workerErrorMeta } from '@/lib/workerErrors';

const props = defineProps<{ walletId: string }>();

const { wallets, refresh: refreshWallets } = useWallets();
const ordersSource = inject(ORDERS_SOURCE_KEY, undefined);
const { balances, refresh: refreshBalances } = useBalances(props.walletId);
const {
  state: ordersState,
  orders,
  error: ordersError,
  workerHealth,
  workerDown,
  refresh: refreshOrders,
} = useOrders(props.walletId, ordersSource);
const {
  submitting: creating,
  error: createError,
  create,
  reset: resetCreate,
} = useCreateOrder(ordersSource);

const wallet = computed(
  () =>
    wallets.value.find((candidate) => candidate.id === props.walletId) ?? null,
);

// Order-form state (page owns it; OrderForm is presentation-only).
const formType = ref<OrderType>('limit');
const formSide = ref<'buy' | 'sell'>('buy');
const formChain = ref<ChainId>('base');
const formBaseAsset = ref<string>(NATIVE_ASSET);
const formQuoteAsset = ref<string>(NATIVE_ASSET);
const formAmount = ref('');
const formLimitPrice = ref('');
const formInterval = ref('');

/** Keep the chain selection honest once the wallet's chains are known. */
watch(wallet, (found) => {
  if (found !== null && !found.chains.includes(formChain.value)) {
    const [first] = found.chains;
    if (first !== undefined) formChain.value = first;
  }
});

/** A changed form invalidates the previous creation outcome. */
watch(formType, () => resetCreate());

const createMeta = computed(() => workerErrorMeta(createError.value));

onMounted(() => {
  void refreshWallets();
  void refreshBalances();
  void refreshOrders();
});

function resetForm(): void {
  formAmount.value = '';
  formLimitPrice.value = '';
  formInterval.value = '';
  resetCreate();
}

/** Convert the form into a frozen NewOrderRequest and submit it. */
async function handleSubmit(): Promise<void> {
  const baseAddress =
    formBaseAsset.value === NATIVE_ASSET
      ? null
      : (formBaseAsset.value as `0x${string}`);
  const quoteAddress =
    formQuoteAsset.value === NATIVE_ASSET
      ? null
      : (formQuoteAsset.value as `0x${string}`);
  const baseMeta = resolveAssetMeta(
    formChain.value,
    baseAddress,
    balances.value,
  );
  const rawAmount =
    baseMeta === null ? null : parseUnits(formAmount.value, baseMeta.decimals);
  if (rawAmount === null) {
    toast.error('Invalid amount — enter a positive number.');
    return;
  }
  const success = await create({
    walletId: props.walletId,
    type: formType.value,
    chain: formChain.value,
    baseAsset: baseAddress,
    quoteAsset: quoteAddress,
    side: formSide.value,
    amount: rawAmount.toString(),
    limitPrice: formType.value === 'limit' ? formLimitPrice.value : null,
    interval: formType.value === 'dca' ? formInterval.value : null,
  });
  if (success) {
    toast.success('Order created', {
      description: 'The order worker will evaluate it on the next tick.',
    });
    resetForm();
    await refreshOrders();
  }
  // Failures surface as the inline Alert (createMeta) — never a stack trace.
}
</script>

<template>
  <div class="grid gap-6">
    <Alert
      v-if="wallet === null"
      variant="destructive"
      data-testid="orders-wallet-not-found"
    >
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>Wallet not found</AlertTitle>
      <AlertDescription>
        No wallet with id {{ walletId }} is known to this deployment.
      </AlertDescription>
    </Alert>

    <template v-else>
      <!-- Degradation banner: worker down → orders stay visible, flagged. -->
      <WorkerHealthBanner
        v-if="workerDown && workerHealth"
        :health="workerHealth"
      />

      <Card>
        <CardHeader>
          <CardTitle>New order</CardTitle>
          <CardDescription>
            Limit and DCA orders only. Stop and TWAP are rejected explicitly.
          </CardDescription>
        </CardHeader>
        <CardContent class="grid gap-4">
          <OrderForm
            :chains="wallet.chains"
            :chain="formChain"
            :balances="balances"
            :type="formType"
            :side="formSide"
            :base-asset="formBaseAsset"
            :quote-asset="formQuoteAsset"
            :amount="formAmount"
            :limit-price="formLimitPrice"
            :interval="formInterval"
            :submitting="creating"
            :worker-down="workerDown"
            @update:chain="formChain = $event"
            @update:type="formType = $event"
            @update:side="formSide = $event"
            @update:base-asset="formBaseAsset = $event"
            @update:quote-asset="formQuoteAsset = $event"
            @update:amount="formAmount = $event"
            @update:limit-price="formLimitPrice = $event"
            @update:interval="formInterval = $event"
            @submit="handleSubmit"
          />
          <!-- Creation failure: human copy for the envelope code, inline. -->
          <Alert
            v-if="createError"
            variant="destructive"
            data-testid="order-create-error"
          >
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>{{ createMeta.title }}</AlertTitle>
            <AlertDescription>
              {{ createMeta.message }}
              <span class="font-mono">(code: {{ createError.code }})</span>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="flex-row items-center justify-between space-y-0">
          <div class="space-y-1.5">
            <CardTitle>Orders</CardTitle>
            <CardDescription>
              Manual refresh only — nothing polls in the background.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            :disabled="ordersState === 'loading'"
            @click="refreshOrders"
          >
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div v-if="ordersState === 'loading'" class="grid gap-2">
            <Skeleton class="h-9 w-full" />
            <Skeleton class="h-9 w-full" />
            <Skeleton class="h-9 w-2/3" />
          </div>

          <Alert
            v-else-if="ordersState === 'error'"
            variant="destructive"
            data-testid="orders-load-error"
          >
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>{{ workerErrorMeta(ordersError).title }}</AlertTitle>
            <AlertDescription>
              {{ workerErrorMeta(ordersError).message }}
              <span class="font-mono">(code: {{ ordersError?.code }})</span>
            </AlertDescription>
          </Alert>

          <OrdersTable v-else :orders="orders" :worker-down="workerDown" />
        </CardContent>
      </Card>
    </template>
  </div>
</template>
