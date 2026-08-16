<script setup lang="ts">
import type { SecurityDecision } from '@kryptr/shared-types';
import { Button } from '@kryptr/shared-ui/vue/button';
import { Separator } from '@kryptr/shared-ui/vue/separator';
import { FileCode, SlidersHorizontal } from '@lucide/vue';
import SecurityDecisionCard from '@/components/SecurityDecisionCard.vue';

defineProps<{
  decision: SecurityDecision;
  /** Unsigned calldata preview when the gate returns one (wave 2: no signing). */
  preview: string | null;
}>();

const emit = defineEmits<{
  (event: 'adjust'): void;
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
          The gate approved this swap. Wave 2 stops here: execution is prepared
          but never signed by Kryptr.
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
