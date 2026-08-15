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
import {
  CHAIN_LABELS,
  NATIVE_DECIMALS,
  NATIVE_SYMBOLS,
  formatUnits,
  shortAddress,
} from '@/lib/format';

const props = defineProps<{ balances: WalletBalance[] }>();

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
      <TableEmpty v-if="rows.length === 0" :colspan="4">
        No balances found for this wallet.
      </TableEmpty>
    </TableBody>
  </Table>
</template>
