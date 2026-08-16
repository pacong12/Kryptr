<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { Badge } from '@kryptr/shared-ui/vue/badge';
import { Button } from '@kryptr/shared-ui/vue/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/vue/card';
import { Separator } from '@kryptr/shared-ui/vue/separator';
import { Skeleton } from '@kryptr/shared-ui/vue/skeleton';
import { TriangleAlert } from '@lucide/vue';
import { toast } from 'vue-sonner';
import LaunchFeePreview from '@/components/LaunchFeePreview.vue';
import T21VerificationCard from '@/components/T21VerificationCard.vue';
import { useLaunchConsent } from '@/composables/useLaunchConsent';
import { shortAddress } from '@/lib/format';
import { LAUNCHPAD_SOURCE_KEY } from '@/lib/launchpad';

const props = defineProps<{ walletId: string }>();

const consent = useLaunchConsent(
  () => props.walletId,
  inject(LAUNCHPAD_SOURCE_KEY, undefined),
);

const acknowledged = ref(false);

/** Consent needs: draft ready, chip verified, AND the permanence check. */
const canConsent = computed(
  () => consent.consentReady.value && acknowledged.value,
);

const verificationBlockCopy = computed(() => {
  if (consent.draftState.value !== 'ready') return '';
  if (consent.verificationState.value === 'verified') return '';
  if (consent.verificationState.value === 'loading') {
    return 'Waiting for T21 verification before consent can be submitted.';
  }
  return 'Consent is blocked: the T21 verification above did not pass.';
});

onMounted(() => {
  void consent.refresh();
});

async function handleSubmit(): Promise<void> {
  if (!canConsent.value || consent.submitting.value) return;
  const success = await consent.submitConsent();
  if (success) {
    toast.success('Consent recorded', {
      description:
        'The deploy intent now waits for human approval (HITL). Automation never deploys.',
    });
  } else if (consent.consentError.value) {
    toast.error('Consent not submitted', {
      description: consent.consentError.value.message,
    });
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <div class="space-y-1">
        <h2 class="text-lg font-semibold">Launch consent</h2>
        <p class="text-muted-foreground text-sm">
          What you consent to below is frozen and sent to the deploy gate — what
          the gate validates is exactly what you saw.
        </p>
      </div>
      <Badge
        v-if="consent.mockMode.value"
        variant="outline"
        data-testid="launch-mock-badge"
      >
        Mock data
      </Badge>
    </div>

    <Card
      v-if="consent.draftState.value === 'error'"
      data-testid="launch-draft-error"
    >
      <CardHeader>
        <CardTitle class="text-base">Unable to load the launch draft</CardTitle>
      </CardHeader>
      <CardContent class="grid gap-3">
        <p class="text-sm">
          {{
            consent.draftError.value?.message ??
            'The launch draft could not be loaded.'
          }}
        </p>
        <Button
          variant="outline"
          size="sm"
          class="w-fit"
          data-testid="launch-retry"
          @click="void consent.refresh()"
        >
          Retry
        </Button>
      </CardContent>
    </Card>

    <div v-else-if="consent.draftState.value === 'loading'" class="grid gap-4">
      <Skeleton class="h-40 w-full" />
      <Skeleton class="h-40 w-full" />
      <Skeleton class="h-24 w-full" />
    </div>

    <template v-else-if="consent.context.value">
      <Card data-testid="launch-token-card">
        <CardHeader>
          <div class="flex items-center justify-between gap-2">
            <CardTitle class="text-base">Token</CardTitle>
            <Badge
              v-if="consent.context.value.bondPaid"
              variant="secondary"
              data-testid="launch-bond-badge"
            >
              Bond paid
            </Badge>
            <Badge v-else variant="destructive" data-testid="launch-bond-badge">
              Bond unpaid
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div class="grid gap-2 text-sm sm:grid-cols-2">
            <div class="grid gap-0.5">
              <p class="text-muted-foreground text-xs">Name</p>
              <p>{{ consent.context.value.tokenName }}</p>
            </div>
            <div class="grid gap-0.5">
              <p class="text-muted-foreground text-xs">Symbol</p>
              <p class="font-mono">{{ consent.context.value.tokenSymbol }}</p>
            </div>
            <div class="grid gap-0.5">
              <p class="text-muted-foreground text-xs">
                Total supply (raw units)
              </p>
              <p class="font-mono text-xs" data-testid="launch-total-supply">
                {{ consent.context.value.totalSupply }}
              </p>
            </div>
            <div class="grid gap-0.5">
              <p class="text-muted-foreground text-xs">Factory</p>
              <p class="font-mono text-xs">
                {{ shortAddress(consent.context.value.factory) }}
              </p>
            </div>
          </div>
          <p class="text-muted-foreground mt-3 text-xs">
            The token is brand new — raw supply units are shown as consented; no
            decimals are invented.
          </p>
        </CardContent>
      </Card>

      <Card data-testid="launch-fee-card">
        <CardHeader>
          <CardTitle class="text-base">Launch fee</CardTitle>
          <CardDescription>
            One-time fee at launch — cost per $100 launched, split across the
            recipients below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LaunchFeePreview
            :fee-bps="consent.context.value.feeBps"
            :fee-recipients="consent.context.value.feeRecipients"
          />
        </CardContent>
      </Card>

      <T21VerificationCard
        :state="consent.verificationState.value"
        :reason="consent.verificationReason.value"
        :claims="consent.verifiedClaims.value"
        :mock-mode="consent.mockMode.value"
      />

      <Card data-testid="launch-consent-card">
        <CardHeader>
          <CardTitle class="text-base">Acknowledge and consent</CardTitle>
        </CardHeader>
        <CardContent class="grid gap-4">
          <div class="grid gap-2">
            <label class="flex items-start gap-3">
              <input
                v-model="acknowledged"
                type="checkbox"
                class="mt-1 size-4 shrink-0 accent-primary"
                data-testid="launch-acknowledge"
              />
              <span class="grid gap-1 text-sm">
                <span class="font-medium">
                  I understand this launch is permanent.
                </span>
                <span class="text-muted-foreground text-xs">
                  After deployment there are no admin controls and no upgrade
                  path: fees, fee recipients and total supply cannot be changed
                  by anyone — including Kryptr. There is no undo.
                </span>
              </span>
            </label>
          </div>

          <Separator />

          <div class="grid gap-2">
            <Button
              :disabled="!canConsent || consent.submitting.value"
              data-testid="launch-consent-submit"
              @click="void handleSubmit()"
            >
              <template v-if="consent.submitting.value">Submitting…</template>
              <template v-else>Consent to launch</template>
            </Button>
            <p
              v-if="verificationBlockCopy"
              class="text-muted-foreground text-xs"
              data-testid="launch-consent-blocked"
            >
              {{ verificationBlockCopy }}
            </p>
          </div>

          <div
            v-if="consent.consentError.value"
            class="flex items-start gap-2 rounded-md border p-3 text-sm"
            role="alert"
            data-testid="launch-consent-error"
          >
            <TriangleAlert
              class="size-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <div class="grid gap-0.5">
              <p class="font-medium">
                <span class="font-mono text-xs">
                  [{{ consent.consentError.value.code }}]
                </span>
                Consent not submitted
              </p>
              <p class="text-muted-foreground text-xs">
                {{ consent.consentError.value.message }}
              </p>
            </div>
          </div>

          <div
            v-if="consent.consented.value"
            class="rounded-md border p-3 text-sm"
            role="status"
            data-testid="launch-consent-recorded"
          >
            <p class="font-medium">Consent recorded</p>
            <p class="text-muted-foreground text-xs">
              Deploy intent
              <span class="font-mono">{{ consent.consented.value.id }}</span>
              now waits for human approval. Automation never produces deploys.
            </p>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
