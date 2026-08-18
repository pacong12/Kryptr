import { Inject, Injectable, Logger } from '@nestjs/common';
import type { TransactionIntent } from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import { ORDER_STORE, type OrderStore } from '../domain/order-store.port';
import { EXECUTION_STORE, type ExecutionStore } from '../domain/execution-store.port';
import { TRIGGER_PRICE, type TriggerPricePort } from '../domain/trigger-price.port';

export interface LimitOrderExecutionInput {
  orderId: string;
}

/**
 * Limit order execution handler.
 * Monitors price and triggers execution when limit price is reached.
 */
@Injectable()
export class LimitSlotExecutionUseCase {
  private readonly logger = new Logger(LimitSlotExecutionUseCase.name);

  constructor(
    @Inject('order-worker.order-store') private readonly orderStore: OrderStore,
    @Inject('order-worker.execution-store') private readonly executionStore: ExecutionStore,
    @Inject('order-worker.trigger-price') private readonly triggerPrice: TriggerPricePort,
  ) {}

  async execute(input: LimitOrderExecutionInput): Promise<{
    status: 'executed' | 'duplicate' | 'skipped' | 'price_not_reached';
    intentId?: string;
  }> {
    // Check if already executed
    const existing = await this.executionStore.findForOrder(input.orderId);
    if (existing !== null) {
      return { status: 'duplicate', intentId: existing.intentId };
    }

    // Fetch the limit order
    const order = await this.orderStore.findById(input.orderId);
    if (!order) {
      throw new DomainError('order_not_found', `order ${input.orderId} does not exist`, 404);
    }

    // Validate order type
    if (order.type !== 'limit') {
      throw new DomainError(
        'invalid_order_type',
        `order ${input.orderId} is not a limit order (type: ${order.type})`,
        400,
      );
    }

    const limitPrice = order.limitPriceMs ?? Infinity;

    // Get current trigger price
    let currentPrice: number | null;
    try {
      currentPrice = await this.triggerPrice.getCurrent();
    } catch (error) {
      this.logger.error(`Failed to get trigger price: ${String(error)}`);
      return { status: 'skipped' };
    }

    if (currentPrice === null) {
      this.logger.log('Price data unavailable, skipping limit order check');
      return { status: 'skipped' };
    }

    // Check expiration
    if (order.expiresAt && Date.now() > new Date(order.expiresAt).getTime()) {
      this.logger.log(`Limit order ${input.orderId} expired`);
      return { status: 'skipped' };
    }

    // Check if price threshold met (for buy orders: price <= limit)
    const priceMet = currentPrice <= limitPrice;

    if (!priceMet) {
      this.logger.log(
        `Price ${currentPrice} > limit ${limitPrice}, execution not triggered`,
      );
      return { status: 'price_not_reached' };
    }

    // Calculate allocation (entire amount for limit orders)
    const totalAmount = order.amount || '0x0';

    // Build transfer intent
    const intentId = `limit-${input.orderId}-exec-${Date.now()}`;
    const intent: TransactionIntent = {
      id: intentId,
      walletId: order.walletId,
      chain: order.chain,
      kind: 'transfer',
      to: order.to,
      asset: order.asset || null,
      amount: totalAmount,
      origin: `automation:limit:${input.orderId}`,
      createdAt: new Date().toISOString(),
    };

    // Record execution
    await this.executionStore.create({
      orderId: input.orderId,
      slotKey: '', // No slot key for limit orders
      intentId,
      executedAmount: totalAmount,
      status: 'pending',
    });

    this.logger.log(`Limit order executed at price ${currentPrice}: ${intentId}`);

    return { status: 'executed', intentId };
  }
}
