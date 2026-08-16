<script setup lang="ts">
import type {
  ApiError,
  SecurityDecision,
  SignRequest,
} from '@kryptr/shared-types';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kryptr/shared-ui/vue/alert';
import { Badge } from '@kryptr/shared-ui/vue/badge';
import {
  FileCode,
  PenLine,
  SlidersHorizontal,
  TriangleAlert,
} from '@lucide/vue';
import { Separator } from '@kryptr/shared-ui/vue/separator';
import { Skeleton } from '@kryptr/shared-ui/vue/skeleton';
import SecurityDecisionCard from '@/components/SecurityDecisionCard.vue';

defineProps<{
  decision: SecurityDecision;
  /** Unsigned calldata preview when the gate returns one (wave 2: no signing). */
  preview: string | null;
  /** Dry-run signature request result (wave 3: display only). */
  signRequest: SignRequest | null;
  signRequesting: boolean;
  signRequestError: ApiError | null;
}>();

const emit = defineEmits<{
  (event: 'adjust'): void;
  /** Ask the API to prepare a dry-run signature for the approved intent. */
  (event: 'sign'): void;
}>();
</script>

<template>
  <div class="space-y-4" data-testid="swap-result">
    <div class="space-y-1">
      <h3 v-if="decision.result === 'approved'" class="text-base font-semibold">
        Approved — ready to sign
      </h3>
      <h3
        v-else-if="decision.result === 'needs_human_approval'"
        class="text-base font-semibold"
      >
        Needs human approval
      </h3>
      <h3 v-else class="text-base font-semibold">
        Rejected — nothing will be signed
      </h3>
      <p class="text-muted-foreground text-sm">
        <template v-if="decision.result === 'approved'">
          The gate approved this swap. Kryptr never signs autonomously — you can
          prepare a dry-run signature below; nothing is ever broadcast.
        </template>
        <template v-else-if="decision.result === 'needs_human_approval'">
          An operator must approve this swap before it can proceed.
        </template>
        <template v-else>
          The security gate blocked this swap. Adjust the amount or pair and try
          again.
        </template>
      </p>
    </div>

    <SecurityDecisionCard :decision="decision" />

    <template v-if="decision.result === 'approved' && preview">
      <Separator />
      <div class="space-y-2">
        <p class="flex items-center gap-1.5 text-sm font-medium">
          <FileCode class="size-4" aria-hidden="true" />
          Unsigned calldata preview
        </p>
        <p class="text-muted-foreground text-xs">
          Review only — this payload is unsigned and nothing has been executed.
        </p>
        <pre
          class="bg-muted max-h-40 overflow-auto rounded-lg p-3 font-mono text-xs"
          data-testid="calldata-preview"
          >{{ preview }}</pre>
      </div>
    </template>

    <template v-if="decision.result === 'approved'">
      <Separator />
      <div class="space-y-3" data-testid="dry-run">
        <div class="space-y-1">
          <p class="flex items-center gap-1.5 text-sm font-medium">
            <PenLine class="size-4" aria-hidden="true" />
            Dry-run signature — nothing broadcast
          </p>
          <p class="text-muted-foreground text-xs">
            Prepares the signature request a real signer would see. Kryptr holds
            no keys; this only shows what WOULD be signed.
          </p>
        </div>

        <Skeleton v-if="signRequesting" class="h-28 w-full" />

        <div
          v-else-if="signRequest"
          class="space-y-2"
          data-testid="dry-run-result"
        >
          <div class="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">status: {{ signRequest.status }}</Badge>
            <span class="text-muted-foreground text-xs">
              {{ signRequest.note }}
            </span>
          </div>
          <dl class="grid gap-2 text-sm">
            <div class="flex items-start justify-between gap-2">
              <dt class="text-muted-foreground">Digest (would be signed)</dt>
              <dd class="max-w-[60%] break-all font-mono text-xs">
                {{ signRequest.digest ?? '—' }}
              </dd>
            </div>
          </dl>
          <pre
            class="bg-muted max-h-40 overflow-auto rounded-lg p-3 font-mono text-xs"
            data-testid="dry-run-tx"
            >{{ JSON.stringify(signRequest.unsignedTx, null, 2) }}</pre>
        </div>

        <div v-else-if="signRequestError" class="space-y-2">
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Dry-run unavailable</AlertTitle>
            <AlertDescription>
              {{ signRequestError.message }}
            </AlertDescription>
          </Alert>
          <Button
            variant="outline"
            size="sm"
            type="button"
            @click="emit('sign')"
          >
            Retry dry-run
          </Button>
        </div>

        <Button
          v-else
          type="button"
          variant="outline"
          class="w-fit"
          @click="emit('sign')"
        >
          <PenLine data-icon="inline-start" aria-hidden="true" />
          Dry-run sign
        </Button>
      </div>
    </template>

    <Button
      v-if="decision.result === 'rejected'"
      type="button"
      variant="outline"
      class="w-fit"
      @click="emit('adjust')"
    >
      <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
      Adjust amount
    </Button>
  </div>
</template>
