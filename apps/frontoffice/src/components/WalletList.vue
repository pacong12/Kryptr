<script setup lang="ts">
import type { AgentWallet } from '@kryptr/shared-types';
import { Badge } from '@kryptr/shared-ui/vue/badge';
import { Button } from '@kryptr/shared-ui/vue/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/vue/card';
import { CHAIN_LABELS, formatTimestamp, shortAddress } from '@/lib/format';

defineProps<{ wallets: AgentWallet[] }>();

const emit = defineEmits<{
  (event: 'open', walletId: string): void;
}>();
</script>

<template>
  <ul class="grid gap-4 sm:grid-cols-2">
    <li v-for="wallet in wallets" :key="wallet.id">
      <Card class="h-full">
        <CardHeader>
          <CardTitle class="font-mono text-base">
            {{ shortAddress(wallet.address) }}
          </CardTitle>
          <CardDescription>
            Created {{ formatTimestamp(wallet.createdAt) }}
          </CardDescription>
        </CardHeader>
        <CardContent class="flex flex-wrap gap-1.5">
          <Badge v-for="chain in wallet.chains" :key="chain" variant="outline">
            {{ CHAIN_LABELS[chain] }}
          </Badge>
          <Badge v-if="wallet.lastKeyRotationAt" variant="secondary">
            keys rotated
          </Badge>
        </CardContent>
        <CardFooter>
          <Button
            variant="outline"
            class="w-full"
            :aria-label="`View balances for wallet ${shortAddress(wallet.address)}`"
            @click="emit('open', wallet.id)"
          >
            View balances
          </Button>
        </CardFooter>
      </Card>
    </li>
  </ul>
</template>
