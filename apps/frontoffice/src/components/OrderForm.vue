<script setup lang="ts">
import { computed } from 'vue';
import type {
  ChainId,
  OrderType,
  TokenHolding,
  WalletBalance,
} from '@kryptr/shared-types';
import { ORDER_TYPES } from '@kryptr/shared-types';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kryptr/shared-ui/vue/alert';
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
import { Info } from '@lucide/vue';
import { isSupportedOrderType } from '@/lib/orders';
import { workerErrorMeta } from '@/lib/workerErrors';
import {
  CHAIN_LABELS,
  NATIVE_ASSET,
  NATIVE_SYMBOLS,
  resolveAssetMeta,
} from '@/lib/format';

const props = defineProps<{
  chains: ChainId[];
  chain: ChainId;
  /** Wallet balances used to derive the asset options. */
  balances: WalletBalance[];
  type: OrderType;
  side: 'buy' | 'sell';
  /** 'native' or a token contract address. */
  baseAsset: string;
  /** 'native' or a token contract address. */
  quoteAsset: string;
  /** Amount, in user-facing decimal units. */
  amount: string;
  /** Limit orders only. */
  limitPrice: string;
  /** ISO-8601 cadence for DCA (e.g. 'P1D'). */
  interval: string;
  submitting: boolean;
  /** Worker health degraded: creation is refused until it returns. */
  workerDown: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:chain', chain: ChainId): void;
  (event: 'update:type', type: OrderType): void;
  (event: 'update:side', side: 'buy' | 'sell'): void;
  (event: 'update:baseAsset', key: string): void;
  (event: 'update:quoteAsset', key: string): void;
  (event: 'update:amount', amount: string): void;
  (event: 'update:limitPrice', price: string): void;
  (event: 'update:interval', interval: string): void;
  (event: 'submit'): void;
}>();

// v-model adapters keep the component presentation-only: state lives in the
// parent page, the form only reports changes.
const chainModel = computed<ChainId>({
  get: () => props.chain,
  set: (value) => emit('update:chain', value),
});
const typeModel = computed<OrderType>({
  get: () => props.type,
  set: (value) => emit('update:type', value),
});
const sideModel = computed<'buy' | 'sell'>({
  get: () => props.side,
  set: (value) => emit('update:side', value),
});
const baseAssetModel = computed<string>({
  get: () => props.baseAsset,
  set: (value) => emit('update:baseAsset', value),
});
const quoteAssetModel = computed<string>({
  get: () => props.quoteAsset,
  set: (value) => emit('update:quoteAsset', value),
});
const amountModel = computed<string>({
  get: () => props.amount,
  set: (value) => emit('update:amount', value),
});
const limitPriceModel = computed<string>({
  get: () => props.limitPrice,
  set: (value) => emit('update:limitPrice', value),
});
const intervalModel = computed<string>({
  get: () => props.interval,
  set: (value) => emit('update:interval', value),
});

const TYPE_LABELS: Record<OrderType, string> = {
  limit: 'Limit',
  stop: 'Stop',
  dca: 'DCA',
  twap: 'TWAP',
};

const INTERVAL_OPTIONS = [
  { value: 'P1H', label: 'Hourly (P1H)' },
  { value: 'P1D', label: 'Daily (P1D)' },
  { value: 'P7D', label: 'Weekly (P7D)' },
] as const;

/**
 * Wave-4 support verdict for the selected type. Stop/twap are SHOWN in the
 * picker (never hidden) but rejected explicitly once selected — the freeze
 * demands an explicit `order_type_unsupported` rejection, not silent drops.
 */
const typeSupported = computed(() => isSupportedOrderType(props.type));
const unsupportedMeta = computed(() =>
  workerErrorMeta({
    code: 'order_type_unsupported',
    message: '',
  }),
);

const chainBalances = computed(() =>
  props.balances.filter((balance) => balance.chain === props.chain),
);
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

function itemLabel(key: string): string {
  if (key === NATIVE_ASSET) {
    return `${NATIVE_SYMBOLS[props.chain]} (native)`;
  }
  const meta = resolveAssetMeta(props.chain, toAddress(key), props.balances);
  return meta ? meta.symbol : key;
}

function isPositiveDecimal(value: string): boolean {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) return false;
  return Number(value) > 0;
}

/** Full client-side validity; the worker re-validates everything server-side. */
const formValid = computed(() => {
  if (!typeSupported.value) return false;
  if (!isPositiveDecimal(props.amount)) return false;
  if (props.baseAsset === props.quoteAsset) return false;
  if (props.type === 'limit' && !isPositiveDecimal(props.limitPrice)) {
    return false;
  }
  if (props.type === 'dca' && props.interval === '') return false;
  return true;
});

const submitBlockedReason = computed(() => {
  if (!typeSupported.value) return null; // rejection Alert already explains
  if (props.workerDown) {
    return 'Order creation is paused — the order worker is down (fail-closed). Refresh once it returns.';
  }
  return null;
});
</script>

<template>
  <div class="grid gap-4">
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="grid gap-2">
        <Label for="order-type">Order type</Label>
        <Select v-model="typeModel">
          <SelectTrigger id="order-type" class="w-full" aria-label="Order type">
            <SelectValue placeholder="Select order type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="candidate in ORDER_TYPES"
              :key="candidate"
              :value="candidate"
            >
              {{ TYPE_LABELS[candidate] }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="grid gap-2">
        <Label for="order-side">Side</Label>
        <Select v-model="sideModel">
          <SelectTrigger id="order-side" class="w-full" aria-label="Side">
            <SelectValue placeholder="Select side" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="buy">Buy</SelectItem>
            <SelectItem value="sell">Sell</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <!-- Explicit rejection for stop/twap: visible, coded, never hidden. -->
    <Alert
      v-if="!typeSupported"
      data-testid="order-type-unsupported"
      variant="destructive"
    >
      <Info aria-hidden="true" />
      <AlertTitle>{{ unsupportedMeta.title }}</AlertTitle>
      <AlertDescription>
        {{ unsupportedMeta.message }}
        <span class="font-mono">(code: order_type_unsupported)</span>
      </AlertDescription>
    </Alert>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="grid gap-2">
        <Label for="order-chain">Chain</Label>
        <Select v-model="chainModel">
          <SelectTrigger id="order-chain" class="w-full" aria-label="Chain">
            <SelectValue placeholder="Select chain" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="candidate in chains"
              :key="candidate"
              :value="candidate"
            >
              {{ CHAIN_LABELS[candidate] }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="grid gap-2">
        <Label for="order-amount">Amount</Label>
        <Input
          id="order-amount"
          v-model="amountModel"
          inputmode="decimal"
          placeholder="0.0"
          :disabled="!typeSupported"
        />
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="grid gap-2">
        <Label for="order-base-asset">Base asset</Label>
        <Select v-model="baseAssetModel" :disabled="!typeSupported">
          <SelectTrigger
            id="order-base-asset"
            class="w-full"
            aria-label="Base asset"
          >
            <SelectValue placeholder="Select base asset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="NATIVE_ASSET">{{
              itemLabel(NATIVE_ASSET)
            }}</SelectItem>
            <SelectItem
              v-for="token in tokenOptions"
              :key="token.contractAddress"
              :value="token.contractAddress"
            >
              {{ itemLabel(token.contractAddress) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="grid gap-2">
        <Label for="order-quote-asset">Quote asset</Label>
        <Select v-model="quoteAssetModel" :disabled="!typeSupported">
          <SelectTrigger
            id="order-quote-asset"
            class="w-full"
            aria-label="Quote asset"
          >
            <SelectValue placeholder="Select quote asset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="NATIVE_ASSET">{{
              itemLabel(NATIVE_ASSET)
            }}</SelectItem>
            <SelectItem
              v-for="token in tokenOptions"
              :key="token.contractAddress"
              :value="token.contractAddress"
            >
              {{ itemLabel(token.contractAddress) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <div v-if="type === 'limit'" class="grid gap-2 sm:max-w-xs">
      <Label for="order-limit-price">Limit price (USD)</Label>
      <Input
        id="order-limit-price"
        v-model="limitPriceModel"
        inputmode="decimal"
        placeholder="0.0"
      />
    </div>

    <div v-if="type === 'dca'" class="grid gap-2 sm:max-w-xs">
      <Label for="order-interval">Repeat every</Label>
      <Select v-model="intervalModel">
        <SelectTrigger
          id="order-interval"
          class="w-full"
          aria-label="Repeat interval"
        >
          <SelectValue placeholder="Select interval" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in INTERVAL_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="grid gap-2">
      <Button
        type="button"
        :disabled="submitting || !formValid || submitBlockedReason !== null"
        @click="emit('submit')"
      >
        {{ submitting ? 'Creating…' : `Create ${TYPE_LABELS[type]} order` }}
      </Button>
      <p v-if="submitBlockedReason" class="text-muted-foreground text-xs">
        {{ submitBlockedReason }}
      </p>
    </div>
  </div>
</template>
