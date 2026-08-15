<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Badge } from '@kryptr/shared-ui/vue/badge';
import { Button } from '@kryptr/shared-ui/vue/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/vue/card';
import { Skeleton } from '@kryptr/shared-ui/vue/skeleton';
import { Wallet } from '@lucide/vue';
import WalletList from '@/components/WalletList.vue';
import { useWallets } from '@/composables/useWallets';

const router = useRouter();
const {
  wallets,
  loading,
  connected,
  mockMode,
  error,
  refresh,
  connect,
  createWallet,
} = useWallets();

onMounted(() => {
  void refresh();
});

function openWallet(walletId: string): void {
  void router.push({ name: 'wallet-detail', params: { walletId } });
}
</script>

<template>
  <div class="space-y-12">
    <section class="space-y-4 py-8 text-center">
      <Badge variant="outline" class="mx-auto">Wave 1 · MVP</Badge>
      <h1 class="text-4xl font-bold tracking-tight text-balance">
        Agent wallets with a security gate built in
      </h1>
      <p class="text-muted-foreground mx-auto max-w-2xl text-lg">
        Kryptr connects your wallets, shows live balances on Base and Robinhood
        Chain, and routes every transfer through the security gate before
        anything is signed.
      </p>
      <div class="flex items-center justify-center pt-2">
        <Button size="lg" :disabled="connected" @click="connect()">
          <Wallet data-icon="inline-start" aria-hidden="true" />
          {{ connected ? 'Mock session active' : 'Connect Wallet' }}
        </Button>
      </div>
      <p v-if="!connected" class="text-muted-foreground text-xs">
        Wave 1 uses a mock connect — real WalletConnect lands in Wave 2.
      </p>
    </section>

    <section v-if="connected" aria-label="Your wallets" class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-xl font-semibold">Your wallets</h2>
        <div class="flex items-center gap-2">
          <Badge v-if="mockMode" variant="secondary">mock data</Badge>
          <Button
            variant="outline"
            size="sm"
            :disabled="loading"
            @click="createWallet()"
          >
            New wallet
          </Button>
        </div>
      </div>

      <p v-if="mockMode" class="text-muted-foreground text-sm">
        The Kryptr API is unreachable — showing fixture wallets so you can
        explore the UI.
      </p>
      <p v-if="error" role="alert" class="text-destructive text-sm">
        {{ error.message }}
      </p>

      <div v-if="loading" class="grid gap-4 sm:grid-cols-2">
        <Skeleton
          v-for="index in 2"
          :key="index"
          class="h-44 w-full rounded-xl"
        />
      </div>

      <WalletList
        v-else-if="wallets.length > 0"
        :wallets="wallets"
        @open="openWallet"
      />

      <Card v-else>
        <CardHeader>
          <CardTitle>No wallets yet</CardTitle>
          <CardDescription>
            Create your first agent wallet to start tracking balances.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button @click="createWallet()">Create your first wallet</Button>
        </CardContent>
      </Card>
    </section>
  </div>
</template>
