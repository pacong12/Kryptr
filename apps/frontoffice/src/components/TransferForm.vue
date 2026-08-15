<script setup lang="ts">
import { computed, ref } from 'vue';
import type {
  AgentWallet,
  ChainId,
  TokenHolding,
  TransactionIntent,
} from '@kryptr/shared-types';
import { Button } from '@kryptr/shared-ui/vue/button';
import { Input } from '@kryptr/shared-ui/vue/input';
import { Label } from '@kryptr/shared-ui/vue/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kryptr/shared-ui/vue/select';
import {
  CHAIN_LABELS,
  NATIVE_DECIMALS,
  NATIVE_SYMBOLS,
  parseUnits,
  shortAddress,
} from '@/lib/format';
import { Send } from '@lucide/vue';

const NATIVE_ASSET = 'native';
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const props = defineProps<{
  wallet: AgentWallet;
  /** Token holdings available on this wallet (from the balance table). */
  assets: TokenHolding[];
}>();

const emit = defineEmits<{
  (event: 'submit', intent: TransactionIntent): void;
}>();

const to = ref('');
const amount = ref('');
const chain = ref<ChainId>(props.wallet.chains[0] ?? 'base');
const asset = ref<string>(NATIVE_ASSET);
const validationError = ref<string | null>(null);

const selectedToken = computed(
  () =>
    props.assets.find(
      (token) => (token.contractAddress ?? token.symbol) === asset.value,
    ) ?? null,
);
const decimals = computed(() =>
  selectedToken.value ? selectedToken.value.decimals : NATIVE_DECIMALS,
);
const symbol = computed(() =>
  selectedToken.value
    ? selectedToken.value.symbol
    : NATIVE_SYMBOLS[chain.value],
);

function handleSubmit(): void {
  validationError.value = null;

  const recipient = to.value.trim();
  if (!ADDRESS_PATTERN.test(recipient)) {
    validationError.value =
      'Enter a valid recipient address (0x + 40 hex characters).';
    return;
  }

  const rawAmount = parseUnits(amount.value, decimals.value);
  if (rawAmount === null || rawAmount <= 0n) {
    validationError.value = `Enter an amount greater than 0 ${symbol.value} (max ${decimals.value} decimal places).`;
    return;
  }

  const typedRecipient = recipient as `0x${string}`; // validated by ADDRESS_PATTERN above
  emit('submit', {
    id: crypto.randomUUID(),
    walletId: props.wallet.id,
    chain: chain.value,
    kind: 'transfer',
    to: typedRecipient,
    asset: selectedToken.value ? selectedToken.value.contractAddress : null,
    amount: rawAmount.toString(),
    origin: 'user',
    createdAt: new Date().toISOString(),
  });
}
</script>

<template>
  <form class="grid gap-4" novalidate @submit.prevent="handleSubmit">
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="grid gap-2">
        <Label for="transfer-chain">Chain</Label>
        <Select v-model="chain">
          <SelectTrigger id="transfer-chain" class="w-full" aria-label="Chain">
            <SelectValue placeholder="Select chain" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in wallet.chains"
              :key="option"
              :value="option"
            >
              {{ CHAIN_LABELS[option] }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="grid gap-2">
        <Label for="transfer-asset">Asset</Label>
        <Select v-model="asset">
          <SelectTrigger id="transfer-asset" class="w-full" aria-label="Asset">
            <SelectValue placeholder="Select asset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="NATIVE_ASSET">
              {{ NATIVE_SYMBOLS[chain] }} (native)
            </SelectItem>
            <SelectItem
              v-for="token in assets"
              :key="token.contractAddress ?? token.symbol"
              :value="token.contractAddress ?? token.symbol"
            >
              {{ token.symbol }} ·
              {{ shortAddress(token.contractAddress ?? '') }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <div class="grid gap-2">
      <Label for="transfer-to">Recipient address</Label>
      <Input
        id="transfer-to"
        v-model="to"
        class="font-mono"
        placeholder="0x…"
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    <div class="grid gap-2">
      <Label for="transfer-amount">Amount ({{ symbol }})</Label>
      <Input
        id="transfer-amount"
        v-model="amount"
        inputmode="decimal"
        placeholder="0.00"
        autocomplete="off"
      />
    </div>

    <p v-if="validationError" role="alert" class="text-destructive text-sm">
      {{ validationError }}
    </p>

    <Button type="submit" class="w-fit">
      <Send data-icon="inline-start" aria-hidden="true" />
      Send to security gate
    </Button>
  </form>
</template>
