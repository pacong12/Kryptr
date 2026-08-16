import { Inject, Injectable } from '@nestjs/common';
import type { Order } from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import { ORDER_STORE, type OrderStore } from '../domain/order-store.port';

/**
 * Cancel an order. Every live status is cancellable: open, paused, AND
 * triggered. D2 (Review54 delta): 'triggered' is cancellable because a
 * kill-switch stop can leave an order there mid-execution — an in-flight
 * execution then fails its post-gate liveness re-check (OW-1), so cancel
 * is safe. Terminal statuses still reject.
 */
@Injectable()
export class CancelOrderUseCase {
  constructor(@Inject(ORDER_STORE) private readonly orderStore: OrderStore) {}

  async execute(orderId: string): Promise<Order> {
    const order = await this.orderStore.findById(orderId);
    if (!order) {
      throw new DomainError(
        'order_not_found',
        `order "${orderId}" not found`,
        404,
      );
    }
    if (
      order.status !== 'open' &&
      order.status !== 'paused' &&
      order.status !== 'triggered'
    ) {
      throw new DomainError(
        'order_not_live',
        `order "${orderId}" is "${order.status}" and cannot be cancelled`,
        409,
      );
    }
    return this.orderStore.setStatus(
      orderId,
      'cancelled',
      new Date().toISOString(),
    );
  }
}
