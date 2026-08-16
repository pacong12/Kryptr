<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Badge } from '@kryptr/shared-ui/vue/badge';
import { Button } from '@kryptr/shared-ui/vue/button';
import { Tabs, TabsList, TabsTrigger } from '@kryptr/shared-ui/vue/tabs';
import { ArrowLeft } from '@lucide/vue';
import { useWallets } from '@/composables/useWallets';
import { CHAIN_LABELS, shortAddress } from '@/lib/format';

const props = defineProps<{ walletId: string }>();

const route = useRoute();
const router = useRouter();
const { wallets, refresh: refreshWallets } = useWallets();

onMounted(() => {
  void refreshWallets();
});

const wallet = computed(
  () =>
    wallets.value.find((candidate) => candidate.id === props.walletId) ?? null,
);

const activeTab = computed(() => {
  if (route.name === 'wallet-swap') return 'swap';
  if (route.name === 'wallet-orders') return 'orders';
  if (route.name === 'wallet-launch') return 'launch';
  return 'overview';
});

function handleTabChange(value: string | number): void {
  const target =
    value === 'swap'
      ? 'wallet-swap'
      : value === 'orders'
        ? 'wallet-orders'
        : value === 'launch'
          ? 'wallet-launch'
          : 'wallet-detail';
  void router.push({
    name: target,
    params: { walletId: props.walletId },
  });
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
        <h1 class="text-2xl font-bold">Wallet</h1>
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

    <Tabs :model-value="activeTab" @update:model-value="handleTabChange">
      <TabsList aria-label="Wallet sections">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="swap">Swap</TabsTrigger>
        <TabsTrigger value="orders">Orders</TabsTrigger>
        <TabsTrigger value="launch">Launch</TabsTrigger>
      </TabsList>
    </Tabs>

    <RouterView />
  </div>
</template>
