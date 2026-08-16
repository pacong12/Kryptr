<script setup lang="ts">
import { Badge } from '@kryptr/shared-ui/vue/badge';
import { Toaster } from '@kryptr/shared-ui/vue/sonner';
import { ShieldCheck } from '@lucide/vue';
</script>

<template>
  <div class="bg-background text-foreground flex min-h-screen flex-col">
    <header class="border-b">
      <div
        class="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4"
      >
        <RouterLink
          to="/"
          class="flex items-center gap-2 font-semibold"
          aria-label="Kryptr home"
        >
          <ShieldCheck class="size-5" aria-hidden="true" />
          Kryptr
          <Badge variant="secondary">frontoffice</Badge>
        </RouterLink>
        <nav aria-label="Primary">
          <RouterLink
            to="/"
            class="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
          >
            Home
          </RouterLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <RouterView />
    </main>

    <footer class="border-t py-6">
      <p class="text-muted-foreground mx-auto w-full max-w-5xl px-4 text-sm">
        Every transaction intent passes the Kryptr security gate before anything
        is signed.
      </p>
    </footer>

    <!-- Swap/transfer outcomes surface as toasts (vue-sonner). -->
    <Toaster />
  </div>
</template>
