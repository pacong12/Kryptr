<script setup lang="ts">
import { computed } from 'vue';
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
import { TriangleAlert } from '@lucide/vue';
import {
  CHAIN_LABELS,
  NATIVE_DECIMALS,
  NATIVE_SYMBOLS,
  formatUnits,
  shortAddress,
} from '@/lib/format';

const props = defineProps<{
  balances: WalletBalance[];
  /** Chains the wallet declares; used to spot chains the reader missed. */
  chains: ChainId[];
}>();

interface BalanceRow {
  key: string;
  asset: string;
  chain: ChainId;
  amount: string;
  contract: string | null;
  native: boolean;
}

const rows = computed<BalanceRow[]>(() =>
  props.balances.flatMap((balance) => {
    const native: BalanceRow = {
      key: `${balance.walletId}:${balance.chain}:native`,
      asset: NATIVE_SYMBOLS[balance.chain],
      chain: balance.chain,
      amount: formatUnits(balance.nativeBalance, NATIVE_DECIMALS),
      contract: null,
      native: true,
    };
    const tokens: BalanceRow[] = balance.tokens.map((token) => ({
      key: `${balance.walletId}:${balance.chain}:${token.contractAddress ?? token.symbol}`,
      asset: token.symbol,
      chain: balance.chain,
      amount: formatUnits(token.amount, token.decimals),
      contract: token.contractAddress,
      native: false,
    }));
    return [native, ...tokens];
  }),
);

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
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Asset</TableHead>
        <TableHead>Chain</TableHead>
        <TableHead class="text-right">Balance</TableHead>
        <TableHead>Contract</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <template v-if="holdsAnything">
        <TableRow v-for="row in rows" :key="row.key">
          <TableCell class="font-medium">
            <span class="flex items-center gap-2">
              {{ row.asset }}
              <Badge v-if="row.native" variant="secondary">native</Badge>
            </span>
          </TableCell>
          <TableCell>{{ CHAIN_LABELS[row.chain] }}</TableCell>
          <TableCell class="text-right font-mono">{{ row.amount }}</TableCell>
          <TableCell class="text-muted-foreground font-mono">
            {{ row.contract ? shortAddress(row.contract) : '—' }}
          </TableCell>
        </TableRow>
      </template>
      <TableRow v-for="chain in missingChains" :key="`missing:${chain}`">
        <TableCell :colspan="4">
          <span class="text-muted-foreground flex items-center gap-2 text-sm">
            <TriangleAlert class="size-4" aria-hidden="true" />
            No balance data for {{ CHAIN_LABELS[chain] }} — the chain reader did
            not answer for this chain. Nothing is fabricated.
          </span>
        </TableCell>
      </TableRow>
      <TableEmpty
        v-if="!holdsAnything && missingChains.length === 0"
        :colspan="4"
      >
        <div class="text-muted-foreground space-y-1 py-6 text-sm">
          <p class="font-medium">No assets to show</p>
          <p>This wallet doesn't hold anything on the loaded chains yet.</p>
        </div>
      </TableEmpty>
    </TableBody>
  </Table>
</template>
