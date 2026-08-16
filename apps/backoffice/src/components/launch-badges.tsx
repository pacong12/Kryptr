import { Badge } from '@kryptr/shared-ui/react/badge';

import type { LaunchReviewStatus } from '@/lib/fixtures';
import { humanize } from '@/lib/format';

/**
 * Wave-5 badge mappings for launch-request review. Every deck-local review
 * status gets an explicit variant — exhaustiveness is compile-time checked
 * by Record and asserted in launch-badges.spec.tsx.
 */

const LAUNCH_STATUS_VARIANTS: Record<
  LaunchReviewStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending_review: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  deployed: 'outline',
};

export function LaunchStatusBadge({ status }: { status: LaunchReviewStatus }) {
  return (
    <Badge variant={LAUNCH_STATUS_VARIANTS[status]}>{humanize(status)}</Badge>
  );
}

/** Bond-paid is a deploy-gate precondition (memo ruling 2) — flag it. */
export function BondPaidBadge({ paid }: { paid: boolean }) {
  return paid ? (
    <Badge variant="outline">bond paid</Badge>
  ) : (
    <Badge variant="destructive">bond unpaid</Badge>
  );
}

/** Claim kind badge — humanized frozen verification claim vocabulary. */
export function VerificationClaimBadge({ claim }: { claim: string }) {
  return <Badge variant="secondary">{humanize(claim)}</Badge>;
}
