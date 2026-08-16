<script setup lang="ts">
import { computed, inject, onMounted } from 'vue';
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
import { useWorkerHealth } from '@/composables/useWorkerHealth';
import { ORDERS_SOURCE_KEY } from '@/lib/orders';

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

// Landing-page status chips: worker health comes from the same fail-closed
// order source the Orders page uses (tests may provide a healthy source).
const ordersSource = inject(ORDERS_SOURCE_KEY, undefined);
const {
  state: workerHealthState,
  workerDown,
  refresh: refreshWorkerHealth,
} = useWorkerHealth(ordersSource);

onMounted(() => {
  void refresh();
  void refreshWorkerHealth();
});

function openWallet(walletId: string): void {
  void router.push({ name: 'wallet-detail', params: { walletId } });
}

/** First known wallet gates the affordance links; null before connect. */
const firstWallet = computed(() => wallets.value[0] ?? null);

/** Honest deployment status of the wallet/trading API. */
const walletApiLabel = computed(() => {
  if (loading.value) return 'Wallet API: checking…';
  if (mockMode.value) return 'Wallet API: unreachable — mock fallback';
  if (error.value !== null) return 'Wallet API: error';
  return 'Wallet API: live';
});
const walletApiDegraded = computed(
  () => !loading.value && (mockMode.value || error.value !== null),
);

/**
 * Worker chip: error, unknown or down all read "unavailable" — never
 * guessed healthy. Only an `ok: true` health card earns "operational".
 */
const workerOperational = computed(
  () => workerHealthState.value === 'ready' && !workerDown.value,
);
const workerLabel = computed(() => {
  if (workerHealthState.value === 'loading') return 'Order worker: checking…';
  if (workerOperational.value) return 'Order worker: operational';
  return 'Order worker: unavailable';
});

/**
 * What lives behind a wallet's tabs — each card carries one honest line
 * about availability in THIS deployment.
 */
const affordances = [
  {
    title: 'Wallets & balances',
    description:
      'Live balances read per chain, with honest empty and partial-failure states — zeros are never fabricated.',
    route: 'wallet-detail',
    action: 'View balances',
  },
  {
    title: 'Swap',
    description:
      'Aggregator quotes evaluated by the security gate. Without a configured aggregator, quotes pause — they are never invented.',
    route: 'wallet-swap',
    action: 'Start a swap',
  },
  {
    title: 'Orders',
    description:
      'Limit and DCA automation with a full lifecycle. The worker defaults to disabled mode, so the page degrades fail-closed until automation is switched on.',
    route: 'wallet-orders',
    action: 'View orders',
  },
] as const;
</script>

<template>
  <div class="space-y-12">
    <section class="space-y-4 py-8 text-center">
      <Badge variant="outline" class="mx-auto">Phase 1 · Base</Badge>
      <h1 class="text-4xl font-bold tracking-tight text-balance">
        Security-gated finance for autonomous agents
      </h1>
      <p class="text-muted-foreground mx-auto max-w-2xl text-lg">
        Kryptr runs agent wallets on Base and routes every value-moving action —
        transfers, swaps, orders — through a security gate: policy caps,
        allowlists, and human approval when needed. Kryptr never fabricates
        data: when a service is unavailable, the UI says so.
      </p>
      <div class="flex items-center justify-center pt-2">
        <Button size="lg" :disabled="connected" @click="connect()">
          <Wallet data-icon="inline-start" aria-hidden="true" />
          {{ connected ? 'Mock session active' : 'Connect Wallet' }}
        </Button>
      </div>
      <p v-if="!connected" class="text-muted-foreground text-xs">
        Connect starts a Phase 1 mock session against the Kryptr API — no
        external wallet is linked yet.
      </p>
    </section>

    <section
      aria-label="Deployment status"
      class="flex flex-wrap items-center justify-center gap-2"
    >
      <Badge
        data-testid="wallet-api-status"
        :variant="walletApiDegraded ? 'outline' : 'secondary'"
      >
        {{ walletApiLabel }}
      </Badge>
      <Badge
        data-testid="order-worker-status"
        :variant="workerOperational ? 'secondary' : 'outline'"
      >
        {{ workerLabel }}
      </Badge>
    </section>

    <section aria-label="What you can do" class="grid gap-4 md:grid-cols-3">
      <Card v-for="feature in affordances" :key="feature.title">
        <CardHeader>
          <CardTitle>{{ feature.title }}</CardTitle>
          <CardDescription>{{ feature.description }}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            v-if="firstWallet !== null"
            variant="outline"
            size="sm"
            as-child
          >
            <RouterLink
              :to="{
                name: feature.route,
                params: { walletId: firstWallet.id },
              }"
            >
              {{ feature.action }}
            </RouterLink>
          </Button>
          <p v-else class="text-muted-foreground text-xs">
            Connect a wallet to open this.
          </p>
        </CardContent>
      </Card>
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

    <section aria-label="Not live yet" class="space-y-2">
      <h2 class="text-sm font-semibold">Not live yet</h2>
      <ul class="text-muted-foreground list-inside list-disc space-y-1 text-sm">
        <li>
          Signing is dry-run only — signature previews are never broadcast.
        </li>
        <li>
          Order executions stop at the unsigned dry-run boundary — nothing is
          broadcast on-chain yet.
        </li>
        <li>
          Robinhood Chain is shown but disabled for orders until chain support
          is confirmed.
        </li>
        <li>
          WalletConnect is not integrated — connect is a Phase 1 mock session.
        </li>
      </ul>
    </section>
  </div>
</template>
