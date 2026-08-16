import type { Order } from '@kryptr/shared-types';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kryptr/shared-ui/react/table';

import {
  OrderSideBadge,
  OrderStatusBadge,
  OrderTypeBadge,
} from '@/components/order-badges';
import { formatDateTime, shortenHex } from '@/lib/format';

function assetLabel(asset: `0x${string}` | null): string {
  return asset === null ? 'native' : shortenHex(asset);
}

/** Presentational orders table; /orders owns the data fetching. */
export function OrdersTable({ orders }: { orders: Order[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Side</TableHead>
          <TableHead>Asset</TableHead>
          <TableHead>Amount (raw)</TableHead>
          <TableHead>Limit / interval</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id}>
            <TableCell className="font-medium">
              <Link
                href={`/orders/${order.id}`}
                className="font-mono underline-offset-4 hover:underline"
              >
                {order.id}
              </Link>
            </TableCell>
            <TableCell>
              <OrderTypeBadge type={order.type} />
            </TableCell>
            <TableCell>
              <OrderSideBadge side={order.side} />
            </TableCell>
            <TableCell className="font-mono text-muted-foreground">
              {assetLabel(order.baseAsset)}
              {' / '}
              {assetLabel(order.quoteAsset)}
            </TableCell>
            <TableCell className="font-mono text-muted-foreground">
              {order.amount}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {order.limitPrice ?? '—'}
              {' · '}
              {order.interval ?? 'once'}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDateTime(order.createdAt)}
            </TableCell>
            <TableCell>
              <OrderStatusBadge status={order.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
