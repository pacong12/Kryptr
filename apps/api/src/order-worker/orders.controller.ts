import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import {
  ok,
  type ApiEnvelope,
  type Order,
  type OrderExecution,
} from '@kryptr/shared-types';
import { DomainError } from '../common/domain-error';
import { ORDER_STORE, type OrderStore } from './domain/order-store.port';
import {
  EXECUTION_STORE,
  type ExecutionStore,
} from './domain/execution-store.port';
import { CreateOrderUseCase } from './application/create-order.usecase';
import { CancelOrderUseCase } from './application/cancel-order.usecase';
import { CreateOrderDto } from './dto/create-order.dto';

/**
 * Automation order entrances (backoffice deck consumer). The worker is
 * keyless: nothing here ever signs or holds keys — orders only ever
 * produce gate-evaluated, unsigned executions.
 */
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly createOrder: CreateOrderUseCase,
    private readonly cancelOrder: CancelOrderUseCase,
    @Inject(ORDER_STORE) private readonly orderStore: OrderStore,
    @Inject(EXECUTION_STORE) private readonly executionStore: ExecutionStore,
  ) {}

  @Post()
  async create(@Body() body: CreateOrderDto): Promise<ApiEnvelope<Order>> {
    return ok(await this.createOrder.execute({ ...body, id: `ord-${randomUUID()}` }));
  }

  @Get()
  async findAll(): Promise<ApiEnvelope<Order[]>> {
    return ok(await this.orderStore.findAll());
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ApiEnvelope<Order>> {
    const order = await this.orderStore.findById(id);
    if (!order) {
      throw new DomainError('order_not_found', `order "${id}" not found`, 404);
    }
    return ok(order);
  }

  @Get(':id/executions')
  async executions(
    @Param('id') id: string,
  ): Promise<ApiEnvelope<OrderExecution[]>> {
    const order = await this.orderStore.findById(id);
    if (!order) {
      throw new DomainError('order_not_found', `order "${id}" not found`, 404);
    }
    return ok(await this.executionStore.findByOrderId(id));
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string): Promise<ApiEnvelope<Order>> {
    return ok(await this.cancelOrder.execute(id));
  }
}
