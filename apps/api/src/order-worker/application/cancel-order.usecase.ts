import { Inject, Injectable } from '@nestjs/common';
import type { Order } from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import { ORDER_STORE, type OrderStore } from '../domain/order-store.port';

/** Cancel an order. Only live statuses (open/paused) are cancellable. */
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
    if (order.status !== 'open' && order.status !== 'paused') {
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
