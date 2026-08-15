<script setup lang="ts">
import type {
  SecurityCheckResult,
  SecurityDecision,
} from '@kryptr/shared-types';
import { Badge, type BadgeVariants } from '@kryptr/shared-ui/vue/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/vue/card';
import { formatTimestamp } from '@/lib/format';

defineProps<{ decision: SecurityDecision }>();

const RESULT_META: Record<
  SecurityCheckResult,
  { label: string; variant: NonNullable<BadgeVariants['variant']> }
> = {
  approved: { label: 'Approved', variant: 'default' },
  needs_human_approval: { label: 'Needs human approval', variant: 'secondary' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};
</script>

<template>
  <Card data-testid="security-decision">
    <CardHeader>
      <div class="flex items-center justify-between gap-2">
        <CardTitle class="text-base">Security decision</CardTitle>
        <Badge :variant="RESULT_META[decision.result].variant">
          {{ RESULT_META[decision.result].label }}
        </Badge>
      </div>
      <CardDescription class="font-mono">
        intent {{ decision.intentId }}
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-2 text-sm">
      <p>{{ decision.reason }}</p>
      <p class="text-muted-foreground">
        Decided {{ formatTimestamp(decision.decidedAt) }}
      </p>
    </CardContent>
  </Card>
</template>
