import type {
  ExecutionStatus,
  KillSwitchMode,
  OrderStatus,
  OrderType,
} from '@kryptr/shared-types';
import { Badge } from '@kryptr/shared-ui/react/badge';

import { humanize } from '@/lib/format';

/**
 * Wave-4 badge mappings for order automation. Every member of the frozen
 * unions gets an explicit variant — exhaustiveness is compile-time checked
 * by Record and asserted in order-badges.spec.tsx.
 */

const ORDER_STATUS_VARIANTS: Record<
  OrderStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending_approval: 'secondary',
  open: 'default',
  paused: 'outline',
  triggered: 'secondary',
  filled: 'default',
  partially_filled: 'secondary',
  cancelled: 'outline',
  rejected: 'destructive',
  expired: 'outline',
  failed: 'destructive',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant={ORDER_STATUS_VARIANTS[status]}>{humanize(status)}</Badge>
  );
}

const ORDER_TYPE_VARIANTS: Record<OrderType, 'outline' | 'secondary'> = {
  limit: 'outline',
  stop: 'outline',
  dca: 'secondary',
  twap: 'outline',
};

export function OrderTypeBadge({ type }: { type: OrderType }) {
  return <Badge variant={ORDER_TYPE_VARIANTS[type]}>{type}</Badge>;
}

export function OrderSideBadge({ side }: { side: 'buy' | 'sell' }) {
  return (
    <Badge variant={side === 'buy' ? 'default' : 'secondary'}>{side}</Badge>
  );
}

const KILL_SWITCH_MODE_VARIANTS: Record<
  KillSwitchMode,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  off: 'outline',
  pause_new: 'secondary',
  cancel_active: 'destructive',
};

export function KillSwitchModeBadge({ mode }: { mode: KillSwitchMode }) {
  return (
    <Badge variant={KILL_SWITCH_MODE_VARIANTS[mode]}>{humanize(mode)}</Badge>
  );
}

const EXECUTION_STATUS_VARIANTS: Record<
  ExecutionStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  claimed: 'secondary',
  gate_rejected: 'destructive',
  quoted: 'secondary',
  submitted: 'default',
  confirmed: 'default',
  failed: 'destructive',
  cancelled: 'outline',
};

export function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
  return (
    <Badge variant={EXECUTION_STATUS_VARIANTS[status]}>
      {humanize(status)}
    </Badge>
  );
}
