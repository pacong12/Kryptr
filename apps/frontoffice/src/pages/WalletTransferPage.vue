<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { Badge } from '@kryptr/shared-ui/vue/badge';
import { Button } from '@kryptr/shared-ui/vue/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/vue/card';
import { Input } from '@kryptr/shared-ui/vue/input';
import { Label } from '@kryptr/shared-ui/vue/label';
import { Separator } from '@kryptr/shared-ui/vue/separator';
import { Skeleton } from '@kryptr/shared-ui/vue/skeleton';
import { TriangleAlert } from '@lucide/vue';
import { toast } from 'vue-sonner';
import TransferFeePreview from '@/components/TransferFeePreview.vue';
import BalanceDisplayCard from '@/components/BalanceDisplayCard.vue';
import { useTransfer } from '@/composables/useTransfer';
import { shortAddress } from '@/lib/format';
import { LAUNCHPAD_SOURCE_KEY } from '@/lib/launchpad';

const props = defineProps<{ walletId: string }>();

const launchpadSource = inject(LAUNCHPAD_SOURCE_KEY, undefined);
const transfer = useTransfer(
  () => props.walletId,
  launchpadSource || ({} as any),
);

const step = ref<'form' | 'confirm' | 'submitting'>('form');
const recipientAddress = ref('');
const amount = ref('');
const selectedAsset = ref<'ETH' | 'USDC'>('ETH');

/** Validation */
const isValidAddress = computed(() => {
  return recipientAddress.value.length === 42 &&
    recipientAddress.value.startsWith('0x');
});

const isValidAmount = computed(() => {
  const val = parseFloat(amount.value);
  return !isNaN(val) && val > 0;
});

const canProceed = computed(
  () =>
    transfer.balancesReady.value &&
    transfer.transferReady.value &&
    isValidAddress.value &&
    isValidAmount.value &&
    !transfer.submitting.value,
);

async function handleValidate(): Promise<void> {
  if (!isValidAddress.value || !isValidAmount.value) {
    toast.error('Validation failed', {
      description: 'Please enter a valid recipient address and positive amount.',
    });
    return;
  }

  // Check balance sufficiency
  const balance = transfer.balances.value[selectedAsset.value];
  if (!balance || parseFloat(balance.toString()) < parseFloat(amount.value)) {
    toast.error('Insufficient balance', {
      description: `You have ${balance?.toString() ?? '0'} ${selectedAsset.value}, but need ${amount.value}.`,
    });
    return;
  }

  step.value = 'confirm';
}

async function handleSubmit(): Promise<void> {
  step.value = 'submitting';
  const success = await transfer.createIntent(
    recipientAddress.value,
    amount.value,
    selectedAsset.value,
  );
  step.value = 'form';

  if (success) {
    toast.success('Transfer intent created', {
      description:
        'The transfer intent now waits for security gate approval before signing.',
    });
    // Reset form
    recipientAddress.value = '';
    amount.value = '';
    transfer.reset();
  } else if (transfer.transferError.value) {
    toast.error('Intent not created', {
      description: transfer.transferError.value.message,
    });
  }
}

async function resetForm(): Promise<void> {
  recipientAddress.value = '';
  amount.value = '';
  selectedAsset.value = 'ETH';
  step.value = 'form';
}

onMounted(() => {
  void transfer.loadBalances();
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <div class="space-y-1">
        <h2 class="text-lg font-semibold">Transfer</h2>
        <p class="text-muted-foreground text-sm">
          Send assets from your agent wallet. All transfers require security gate
          approval.
        </p>
      </div>
      <Badge variant="outline">Phase 1</Badge>
    </div>

    <!-- Balance Display -->
    <Card data-testid="transfer-balance-card">
      <CardHeader>
        <CardTitle class="text-base">Available balances</CardTitle>
        <CardDescription>
          Balances across supported chains (Base, Robinhood Chain)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <BalanceDisplayCard :wallet-id="props.walletId" />
      </CardContent>
    </Card>

    <!-- Step 1: Form -->
    <Card v-if="step === 'form'" data-testid="transfer-form-card">
      <CardHeader>
        <CardTitle class="text-base">Transfer details</CardTitle>
      </CardHeader>
      <CardContent class="grid gap-4">
        <div class="grid gap-2">
          <Label for="recipient">Recipient address</Label>
          <Input
            id="recipient"
            v-model="recipientAddress"
            placeholder="0x..."
            :class="{
              'border-destructive': !isValidAddress && recipientAddress.length > 0,
            }"
            data-testid="transfer-recipient"
          />
          <p
            v-if="!isValidAddress && recipientAddress.length > 0"
            class="text-destructive text-xs"
          >
            Please enter a valid Ethereum address (0x + 40 hex chars)
          </p>
        </div>

        <div class="grid gap-2">
          <Label for="amount">Amount</Label>
          <Input
            id="amount"
            type="number"
            step="any"
            v-model="amount"
            placeholder="0.00"
            :class="{
              'border-destructive': !isValidAmount && amount.length > 0,
            }"
            data-testid="transfer-amount"
          />
          <p
            v-if="!isValidAmount && amount.length > 0"
            class="text-destructive text-xs"
          >
            Please enter a positive amount
          </p>
        </div>

        <div class="grid gap-2">
          <Label for="asset">Asset</Label>
          <select
            id="asset"
            v-model="selectedAsset"
            class="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="transfer-asset-select"
          >
            <option value="ETH">ETH</option>
            <option value="USDC">USDC</option>
          </select>
        </div>

        <Separator />

        <div class="grid gap-2">
          <Button
            :disabled="!canProceed"
            data-testid="transfer-validate-btn"
            @click="void handleValidate()"
          >
            Review transfer
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Step 2: Confirmation -->
    <Card v-else-if="step === 'confirm'" data-testid="transfer-confirm-card">
      <CardHeader>
        <CardTitle class="text-base">Confirm transfer</CardTitle>
        <CardDescription>
          Review your transfer details before creating the intent
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid gap-2 text-sm">
          <div class="grid gap-0.5">
            <p class="text-muted-foreground text-xs">Recipient</p>
            <p class="font-mono">{{ recipientAddress }}</p>
            <p
              v-if="recipientAddress.length === 42"
              class="text-muted-foreground text-xs"
            >
              {{ shortAddress(recipientAddress) }}
            </p>
          </div>

          <div class="grid gap-0.5">
            <p class="text-muted-foreground text-xs">Amount</p>
            <p class="font-medium">{{ amount }} {{ selectedAsset }}</p>
          </div>

          <div class="grid gap-0.5">
            <p class="text-muted-foreground text-xs">Network fee estimate</p>
            <p class="font-medium">
              ~{{ transfer.gasEstimate.value }} gwei
            </p>
          </div>
        </div>

        <TransferFeePreview
          :fee-bps="transfer.feeBps.value"
          :fee-recipients="transfer.feeRecipients.value"
        />

        <div
          v-if="transfer.transferError.value"
          class="flex items-start gap-2 rounded-md border p-3 text-sm"
          role="alert"
          data-testid="transfer-error-alert"
        >
          <TriangleAlert
            class="size-4 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <div class="grid gap-0.5">
            <p class="font-medium">
              <span class="font-mono text-xs">
                [{{ transfer.transferError.value.code }}]
              </span>
              Error
            </p>
            <p class="text-muted-foreground text-xs">
              {{ transfer.transferError.value.message }}
            </p>
          </div>
        </div>

        <div class="grid gap-2">
          <Button
            :disabled="transfer.submitting.value"
            data-testid="transfer-submit-btn"
            @click="void handleSubmit()"
          >
            <template v-if="transfer.submitting.value">Creating intent...</template>
            <template v-else>Create transfer intent</template>
          </Button>
          <Button
            variant="ghost"
            data-testid="transfer-back-btn"
            @click="resetForm"
          >
            Back to form
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Loading State -->
    <div
      v-if="transfer.loadingBalances.value"
      data-testid="transfer-loading-skeleton"
      class="grid gap-4"
    >
      <Skeleton class="h-40 w-full" />
      <Skeleton class="h-40 w-full" />
    </div>
  </div>
</template>
