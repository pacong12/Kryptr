<script setup lang="ts">
import { Button } from '@kryptr/shared-ui/vue/button';
import { Badge } from '@kryptr/shared-ui/vue/badge';
import { Input } from '@kryptr/shared-ui/vue/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/vue/card';
</script>

<template>
  <main class="bg-background flex min-h-screen items-center justify-center p-8">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>Kryptr Frontoffice</CardTitle>
        <CardDescription>
          shadcn-vue smoke page — components live in
          <code>@kryptr/shared-ui</code>
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4">
        <Badge class="w-fit">Wave 0</Badge>
        <Input placeholder="Search assets…" aria-label="Search assets" />
        <Button>Connect Wallet</Button>
      </CardContent>
    </Card>
  </main>
</template>
