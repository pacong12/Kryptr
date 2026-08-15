import type { ChainId } from './chains.js';

export const ORDER_TYPES = ['limit', 'stop', 'dca', 'twap'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = [
  'pending_approval',
  'open',
  'filled',
  'partially_filled',
  'cancelled',
  'rejected',
  'expired',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Order {
  id: string;
  walletId: string;
  type: OrderType;
  status: OrderStatus;
  chain: ChainId;
  /** Asset being bought/sold (contract address or null for native). */
  baseAsset: `0x${string}` | null;
  /** Quote asset used for pricing. */
  quoteAsset: `0x${string}` | null;
  side: 'buy' | 'sell';
  /** Raw units as string. */
  amount: string;
  limitPrice: string | null;
  /** ISO-8601 interval for dca/twap, e.g. "P1D". */
  interval: string | null;
  createdAt: string;
}
