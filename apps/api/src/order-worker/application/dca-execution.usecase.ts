import { Inject, Injectable, Logger } from '@nestjs/common';
import type { TransactionIntent } from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import { ORDER_STORE, type OrderStore } from '../domain/order-store.port';
import { EXECUTION_STORE, type ExecutionStore } from '../domain/execution-store.port';
import { DCA_ORDER_TYPE } from '../domain/schedule';

export interface DCASlotExecutionInput {
  orderId: string;
  slotKey: string;
}

/**
 * Dollar-Cost Averaging order slot execution handler.
 * Evaluates whether a DCA interval is ready to execute based on current time.
 */
@Injectable()
export class DCASlotExecutionUseCase {
  private readonly logger = new Logger(DCASlotExecutionUseCase.name);

  constructor(
    @Inject('order-worker.order-store') private readonly orderStore: OrderStore,
    @Inject('order-worker.execution-store') private readonly executionStore: ExecutionStore,
  ) {}

  async execute(input: DCASlotExecutionInput): Promise<{
    status: 'executed' | 'duplicate' | 'skipped';
    intentId?: string;
  }> {
    // Check if execution already recorded
    const existing = await this.executionStore.findForSlot(input.orderId, input.slotKey);
    if (existing !== null) {
      return { status: 'duplicate', intentId: existing.intentId };
    }

    // Fetch the DCA order
    const order = await this.orderStore.findById(input.orderId);
    if (!order) {
      throw new DomainError('order_not_found', `order ${input.orderId} does not exist`, 404);
    }

    // Validate order type
    if (order.type !== DCA_ORDER_TYPE) {
      throw new DomainError(
        'invalid_order_type',
        `order ${input.orderId} is not a DCA order (type: ${order.type})`,
        400,
      );
    }

    // Get current time
    const nowMs = Date.now();

    // Calculate slot details
    const intervalMs = order.intervalMs ?? 86_400_000; // Default to daily
    const elapsed = Math.max(0, nowMs - order.createdAtMs);
    const n = Math.floor(elapsed / intervalMs);
    const slotStartMs = order.createdAtMs + n * intervalMs;

    // Convert slot key to ms
    const slotKeyDate = new Date(input.slotKey);
    const slotStartFromKey = slotKeyDate.getTime();

    // Validate slot alignment (tolerance: ±5 minutes)
    if (Math.abs(slotStartFromKey - slotStartMs) > 300_000) {
      this.logger.warn(
        `DCA slot misaligned: expected ${slotStartMs}, got ${slotStartFromKey}`,
      );
      return { status: 'skipped' };
    }

    // Check if we're within the slot window (±5 min)
    const inWindow = Math.abs(nowMs - slotStartFromKey) <= 300_000;

    if (!inWindow) {
      this.logger.log(`DCA slot ${input.slotKey} not yet active for execution`);
      return { status: 'skipped' };
    }

    // Calculate remaining amount (total - sum of executed amounts)
    const totalAmount = order.amount || '0x0';

    // For simplicity, each slot executes equal portion
    const slotsCount = order.slotsCount || 1;
    const allocationPerSlot = this.divideWei(totalAmount, slotsCount);

    // Build transfer intent for this slot
    const intentId = `dca-${input.orderId}-${input.slotKey}`;
    const intent: TransactionIntent = {
      id: intentId,
      walletId: order.walletId,
      chain: order.chain,
      kind: 'transfer',
      to: order.to,
      asset: order.asset || null,
      amount: allocationPerSlot,
      origin: `automation:dca:${input.orderId}`,
      createdAt: new Date().toISOString(),
    };

    // Persist execution record
    await this.executionStore.create({
      orderId: input.orderId,
      slotKey: input.slotKey,
      intentId,
      executedAmount: allocationPerSlot,
      status: 'pending',
    });

    this.logger.log(`DCA slot executed: ${input.slotKey} -> ${intentId}`);

    return { status: 'executed', intentId };
  }

  private divideWei(total: string, parts: number): string {
    // Simple division for demo (production would use proper big decimal)
    const totalValue = BigInt(total.replace(/^0x/i, '') || '0');
    const perPart = totalValue / BigInt(parts);
    return `0x${perPart.toString(16)}`;
  }
}
