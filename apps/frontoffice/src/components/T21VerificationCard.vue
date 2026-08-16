<script setup lang="ts">
import { computed } from 'vue';
import type {
  VerificationClaim,
  VerificationClaimKind,
} from '@kryptr/shared-types';
import { VERIFICATION_CLAIMS } from '@kryptr/shared-types';
import { Badge } from '@kryptr/shared-ui/vue/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/vue/card';
import { Skeleton } from '@kryptr/shared-ui/vue/skeleton';
import type {
  VerificationFailReason,
  VerificationState,
} from '@/composables/useLaunchConsent';

const props = defineProps<{
  state: VerificationState;
  reason: VerificationFailReason | null;
  /** Claims of the FETCHED artifact — rendered only after full comparison. */
  claims: VerificationClaim[];
  mockMode: boolean;
}>();

/**
 * Claim → user-facing copy (Web3Intel T21 consent rendering contract §8,
 * rule 2). PARITY GUARD: the frozen union forces this map to cover every
 * claim kind — adding a claim to shared-types breaks this component until
 * copy exists. No free-form security marketing, never a "bug-free" claim.
 */
const CLAIM_COPY: Record<VerificationClaimKind, string> = {
  admin_key_free: 'No admin keys',
  non_upgradeable: 'No upgrade path',
  fee_split_invariant: 'Fees cannot change after launch',
  bond_accounting: 'Bond accounting verified',
};

/** Grouped copy when both no-admin and no-upgrade claims are present. */
const COMBINED_ADMIN_UPGRADE_COPY = 'No admin, no upgrades';

const REASON_COPY: Record<VerificationFailReason, string> = {
  missing: 'The draft carries no verification reference.',
  fetch_failed: 'The verification artifact could not be fetched.',
  id_mismatch: 'The artifact id does not match the consented reference.',
  hash_mismatch: 'The artifact hash does not match the consented reference.',
  claims_missing: 'The artifact no longer covers every consented claim.',
};

interface VerificationRow {
  copy: string;
  evidence: string | null;
}

const rows = computed<VerificationRow[]>(() => {
  const byKind = new Map<VerificationClaimKind, VerificationClaim>();
  for (const claim of props.claims) {
    if ((VERIFICATION_CLAIMS as readonly string[]).includes(claim.claim)) {
      byKind.set(claim.claim as VerificationClaimKind, claim);
    }
  }
  const result: VerificationRow[] = [];
  const admin = byKind.get('admin_key_free');
  const upgrade = byKind.get('non_upgradeable');
  if (admin && upgrade) {
    result.push({
      copy: COMBINED_ADMIN_UPGRADE_COPY,
      evidence: admin.evidence ?? upgrade.evidence ?? null,
    });
  } else {
    if (admin) {
      result.push({
        copy: CLAIM_COPY.admin_key_free,
        evidence: admin.evidence ?? null,
      });
    }
    if (upgrade) {
      result.push({
        copy: CLAIM_COPY.non_upgradeable,
        evidence: upgrade.evidence ?? null,
      });
    }
  }
  const fees = byKind.get('fee_split_invariant');
  if (fees) {
    result.push({
      copy: CLAIM_COPY.fee_split_invariant,
      evidence: fees.evidence ?? null,
    });
  }
  const bond = byKind.get('bond_accounting');
  if (bond) {
    result.push({
      copy: CLAIM_COPY.bond_accounting,
      evidence: bond.evidence ?? null,
    });
  }
  return result;
});

const reasonCopy = computed(() =>
  props.reason === null ? '' : REASON_COPY[props.reason],
);
</script>

<template>
  <Card data-testid="verification-card">
    <CardHeader>
      <div class="flex items-center justify-between gap-2">
        <CardTitle class="text-base">T21 verification</CardTitle>
        <div class="flex items-center gap-2">
          <Badge
            v-if="mockMode"
            variant="outline"
            data-testid="verification-mock-badge"
          >
            Mock data
          </Badge>
          <Badge
            v-if="state === 'verified'"
            variant="secondary"
            data-testid="verification-status"
          >
            T21 verified
          </Badge>
          <Badge
            v-else-if="state === 'unverified'"
            variant="outline"
            data-testid="verification-status"
          >
            Not verified
          </Badge>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <div
        v-if="state === 'loading'"
        class="grid gap-2"
        data-testid="verification-loading"
      >
        <Skeleton class="h-4 w-3/4" />
        <Skeleton class="h-4 w-1/2" />
        <p class="text-muted-foreground text-xs">
          Fetching the T21 artifact and comparing id, hash and claims…
        </p>
      </div>

      <div v-else-if="state === 'verified'" class="grid gap-3">
        <div
          v-for="row in rows"
          :key="row.copy"
          class="grid gap-0.5"
          data-testid="verification-row"
        >
          <p class="text-sm font-medium">{{ row.copy }}</p>
          <p
            v-if="row.evidence"
            class="font-mono text-xs text-muted-foreground"
            data-testid="verification-evidence"
          >
            {{ row.evidence }}
          </p>
        </div>
        <p class="text-muted-foreground text-xs">
          Claims shown only from the fetched T21 artifact — id, hash and claims
          were compared before render.
        </p>
      </div>

      <div v-else-if="state === 'unverified'" class="grid gap-2">
        <p class="text-sm" data-testid="verification-reason">
          {{ reasonCopy }}
        </p>
        <p class="text-muted-foreground text-xs">
          Consent is blocked until verification passes. No claims are shown —
          nothing here is guessed.
        </p>
      </div>
    </CardContent>
  </Card>
</template>
