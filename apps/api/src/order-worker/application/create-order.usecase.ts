import { Inject, Injectable } from '@nestjs/common';
import type { Order, OrderType } from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import { ORDER_STORE, type OrderStore } from '../domain/order-store.port';
import { KILL_SWITCH, type KillSwitchPort } from '../domain/kill-switch.port';
import { isoDurationToMs } from '../domain/schedule';

/**
 * Create an automation order. Wave-4 scope: limit + dca ONLY — stop and
 * twap are rejected explicitly (order_type_unsupported), never silently
 * accepted. Kill switch blocks creation entirely (fail-closed).
 */
@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDER_STORE) private readonly orderStore: OrderStore,
    @Inject(KILL_SWITCH) private readonly killSwitch: KillSwitchPort,
  ) {}

  async execute(input: {
    id: string;
    walletId: string;
    type: OrderType;
    chain: Order['chain'];
    baseAsset: `0x${string}` | null;
    quoteAsset: `0x${string}` | null;
    side: 'buy' | 'sell';
    amount: string;
    limitPrice: string | null;
    interval: string | null;
  }): Promise<Order> {
    if (input.type === 'stop' || input.type === 'twap') {
      throw new DomainError(
        'order_type_unsupported',
        `order type "${input.type}" is not supported in wave 4 (limit and dca only)`,
        422,
      );
    }

    const killState = await this.killSwitch.getState();
    if (killState.mode !== 'off') {
      throw new DomainError(
        'kill_switch_active',
        `kill switch is "${killState.mode}"; no new orders can be created`,
        403,
      );
    }

    if (!/^\d+$/.test(input.amount) || input.amount === '0') {
      throw new DomainError(
        'order_type_unsupported',
        'order amount must be a positive raw-unit integer string',
        422,
      );
    }

    if (input.type === 'limit') {
      const limit = Number(input.limitPrice);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new DomainError(
          'order_type_unsupported',
          'limit orders require a positive limitPrice',
          422,
        );
      }
    }
    if (input.type === 'dca') {
      if (!input.interval || isoDurationToMs(input.interval) === null) {
        throw new DomainError(
          'order_type_unsupported',
          'dca orders require a valid ISO-8601 interval (e.g. "P1D")',
          422,
        );
      }
    }

    const order: Order = {
      id: input.id,
      walletId: input.walletId,
      type: input.type,
      status: 'open',
      chain: input.chain,
      baseAsset: input.baseAsset,
      quoteAsset: input.quoteAsset,
      side: input.side,
      amount: input.amount,
      limitPrice: input.limitPrice,
      interval: input.interval,
      createdAt: new Date().toISOString(),
    };
    await this.orderStore.save(order);
    return order;
  }
}
