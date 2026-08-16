<script setup lang="ts">
import { computed } from 'vue';
import type {
  ChainId,
  TokenHolding,
  WalletBalance,
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
import { ArrowDownUp } from '@lucide/vue';
import {
  CHAIN_LABELS,
  NATIVE_ASSET,
  NATIVE_DECIMALS,
  NATIVE_SYMBOLS,
  formatUnits,
  resolveAssetMeta,
} from '@/lib/format';

const props = defineProps<{
  chains: ChainId[];
  chain: ChainId;
  /** Wallet balances used to derive the swappable asset options. */
  balances: WalletBalance[];
  /** 'native' or a token contract address. */
  assetIn: string;
  assetOut: string;
  /** Amount to sell, in user-facing decimal units. */
  amount: string;
}>();

const emit = defineEmits<{
  (event: 'update:chain', chain: ChainId): void;
  (event: 'update:assetIn', key: string): void;
  (event: 'update:assetOut', key: string): void;
  (event: 'update:amount', amount: string): void;
  (event: 'flip'): void;
}>();

// v-model adapters keep the component presentation-only: state lives in the
// parent page, the form only reports changes.
const chainModel = computed<ChainId>({
  get: () => props.chain,
  set: (value) => emit('update:chain', value),
});
const assetInModel = computed<string>({
  get: () => props.assetIn,
  set: (value) => emit('update:assetIn', value),
});
const assetOutModel = computed<string>({
  get: () => props.assetOut,
  set: (value) => emit('update:assetOut', value),
});
const amountModel = computed<string>({
  get: () => props.amount,
  set: (value) => emit('update:amount', value),
});

const chainBalances = computed(() =>
  props.balances.filter((balance) => balance.chain === props.chain),
);
/** Token holdings with a real contract address (native trades as 'native'). */
const tokenOptions = computed(() =>
  chainBalances.value
    .flatMap((balance) => balance.tokens)
    .filter(
      (token): token is TokenHolding & { contractAddress: `0x${string}` } =>
        token.contractAddress !== null,
    ),
);

function toAddress(key: string): `0x${string}` | null {
  return key === NATIVE_ASSET ? null : (key as `0x${string}`);
}

const inMeta = computed(() =>
  resolveAssetMeta(props.chain, toAddress(props.assetIn), props.balances),
);
const balanceHint = computed(() => {
  if (props.assetIn === NATIVE_ASSET) {
    const native = chainBalances.value[0]?.nativeBalance ?? '0';
    return formatUnits(native, NATIVE_DECIMALS);
  }
  const token = tokenOptions.value.find(
    (candidate) => candidate.contractAddress === props.assetIn,
  );
  return token ? formatUnits(token.amount, token.decimals) : null;
});

function itemLabel(key: string): string {
  if (key === NATIVE_ASSET) {
    return `${NATIVE_SYMBOLS[props.chain]} (native)`;
  }
  const meta = resolveAssetMeta(props.chain, toAddress(key), props.balances);
  return meta ? meta.symbol : key;
}
</script>

<template>
  <div class="grid gap-4">
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="grid gap-2">
        <Label for="swap-chain">Chain</Label>
        <Select v-model="chainModel">
          <SelectTrigger id="swap-chain" class="w-full" aria-label="Chain">
            <SelectValue placeholder="Select chain" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="option in chains" :key="option" :value="option">
              {{ CHAIN_LABELS[option] }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="grid gap-2">
        <Label for="swap-amount">
          Amount to sell ({{ inMeta?.symbol ?? '…' }})
        </Label>
        <Input
          id="swap-amount"
          v-model="amountModel"
          inputmode="decimal"
          placeholder="0.00"
          autocomplete="off"
        />
        <p v-if="balanceHint !== null" class="text-muted-foreground text-xs">
          Available: {{ balanceHint }} {{ inMeta?.symbol ?? '' }}
        </p>
      </div>
    </div>

    <div class="grid items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
      <div class="grid gap-2">
        <Label for="swap-asset-in">You sell</Label>
        <Select v-model="assetInModel">
          <SelectTrigger
            id="swap-asset-in"
            class="w-full"
            aria-label="Asset to sell"
          >
            <SelectValue placeholder="Select asset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="NATIVE_ASSET">
              {{ itemLabel(NATIVE_ASSET) }}
            </SelectItem>
            <SelectItem
              v-for="token in tokenOptions"
              :key="token.contractAddress"
              :value="token.contractAddress"
            >
              {{ token.symbol }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Flip swap direction"
        class="mb-0.5 justify-self-center"
        @click="emit('flip')"
      >
        <ArrowDownUp aria-hidden="true" />
      </Button>

      <div class="grid gap-2">
        <Label for="swap-asset-out">You receive</Label>
        <Select v-model="assetOutModel">
          <SelectTrigger
            id="swap-asset-out"
            class="w-full"
            aria-label="Asset to receive"
          >
            <SelectValue placeholder="Select asset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="NATIVE_ASSET">
              {{ itemLabel(NATIVE_ASSET) }}
            </SelectItem>
            <SelectItem
              v-for="token in tokenOptions"
              :key="token.contractAddress"
              :value="token.contractAddress"
            >
              {{ token.symbol }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  </div>
</template>
