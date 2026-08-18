'use client';

import { useState } from 'react';
import { Button } from '@kryptr/shared-ui/react/button';
import { Badge } from '@kryptr/shared-ui/react/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';
import { toast } from 'sonner';
import { useOrdersPolling } from '@/composables/useOrdersPolling';
import {
  OrderSideBadge,
  OrderStatusBadge,
  OrderTypeBadge,
} from '@/components/order-badges';
import { KillSwitchDialog } from '@/components/kill-switch-dialog';
import { setKillSwitchMode, type KillSwitchActionResult } from '@/app/orders/actions';
import { formatDateTime, shortenHex } from '@/lib/format';
import type { Order, KillSwitchMode, KillSwitchState } from '@kryptr/shared-types';

function assetLabel(asset: `0x${string}` | null): string {
  return asset === null ? 'native' : shortenHex(asset);
}

/**
 * W7-M6: Live orders table component with auto-refresh animation for new entries.
 */
function OrdersTableLive({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        No orders found. Polling for updates...
      </p>
    );
  }

  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-border bg-muted/50">
        <tr>
          <th className="px-4 py-3 font-medium">Order</th>
          <th className="px-4 py-3 font-medium">Type</th>
          <th className="px-4 py-3 font-medium">Side</th>
          <th className="px-4 py-3 font-medium">Asset</th>
          <th className="px-4 py-3 font-medium">Amount</th>
          <th className="px-4 py-3 font-medium">Limit / Interval</th>
          <th className="px-4 py-3 font-medium">Created</th>
          <th className="px-4 py-3 font-medium">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {orders.map((order, index) => (
          <tr
            key={order.id}
            className={`transition-all duration-300 ease-in-out ${index === 0 ? 'animate-pulse bg-green-500/5' : ''}`}
          >
            <td className="px-4 py-2 font-medium">
              <span className="font-mono">{order.id}</span>
            </td>
            <td className="px-4 py-2">
              <OrderTypeBadge type={order.type} />
            </td>
            <td className="px-4 py-2">
              <OrderSideBadge side={order.side} />
            </td>
            <td className="px-4 py-2 font-mono text-muted-foreground">
              {assetLabel(order.baseAsset)} / {assetLabel(order.quoteAsset)}
            </td>
            <td className="px-4 py-2 font-mono text-muted-foreground">
              {order.amount}
            </td>
            <td className="px-4 py-2 text-muted-foreground">
              {order.limitPrice ?? '—'} · {order.interval ?? 'once'}
            </td>
            <td className="px-4 py-2 text-muted-foreground">
              {formatDateTime(order.createdAt)}
            </td>
            <td className="px-4 py-2">
              <OrderStatusBadge status={order.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * W7-M6: Kill-switch section component displaying current state and providing controls.
 * Task 3.1: Wire emergency freeze button to POST /kill-switch/freeze endpoint.
 */
function KillSwitchSection({
  currentState,
}: {
  currentState: KillSwitchState;
}) {
  const [isFreezing, setIsFreezing] = useState(false);
  const [currentMode, setCurrentMode] = useState<KillSwitchMode>(currentState.mode);

  const handleEmergencyFreeze = async () => {
    if (!window.confirm('⚠️ EMERGENCY FREEZE: This will immediately block all order execution. Proceed?')) {
      return;
    }

    setIsFreezing(true);
    try {
      const result: KillSwitchActionResult = await setKillSwitchMode('pause_new', 'EMERGENCY_FREEZE_TRIGGERED');
      
      if (result.ok && result.state) {
        setCurrentMode(result.state.mode);
        toast.success('Emergency freeze activated', {
          description: 'All order execution has been blocked system-wide.',
        });
      } else {
        toast.error('Emergency freeze failed', {
          description: result.message,
        });
      }
    } catch (error) {
      toast.error('Emergency freeze failed', {
        description: 'Network error while freezing orders.',
      });
    } finally {
      setIsFreezing(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-red-800">Kill Switch Active</h3>
          <p className="mt-1 text-xs text-red-700">
            Mode: <Badge variant="outline" className="ml-2">{currentMode.replace('_', ' ')}</Badge>
          </p>
        </div>
        <Button
          onClick={handleEmergencyFreeze}
          disabled={isFreezing || currentMode === 'pause_new'}
          variant="destructive"
          size="sm"
        >
          {isFreezing ? 'Freezing...' : 'Emergency Freeze'}
        </Button>
      </div>
      <p className="mt-2 text-xs text-red-600">
        ⚠️ WARNING: This blocks ALL order execution immediately. Use only in emergencies.
      </p>
    </div>
  );
}

/**
 * W7-M6: Main orders page component integrating live polling composable.
 * Auto-refreshes every 5 seconds with loading indicators and status colors.
 * Task 3.1: Integrated kill-switch controls via Dialog and emergency freeze button.
 */
export function OrdersTablePage() {
  const { orders, loading, lastFetchedAt } = useOrdersPolling({
    intervalMs: 5000,
  });

  // Placeholder for kill-switch state (would be fetched from API in production)
  const killSwitchState: KillSwitchState = {
    mode: 'off' as KillSwitchMode,
    appliedAt: null,
    reason: null,
    frozenBy: null,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <span>Orders</span>
            {loading && <span className="text-xs text-muted-foreground">(updating...)</span>}
          </CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <KillSwitchDialog />
            <span className="text-muted-foreground">
              Last fetch: {lastFetchedAt?.toLocaleTimeString()}
            </span>
            <span
              className={`h-2 w-2 rounded-full ${loading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Task 3.1: Kill-switch controls section */}
        <KillSwitchSection currentState={killSwitchState} />
        
        <OrdersTableLive orders={orders} />
      </CardContent>
    </Card>
  );
}
