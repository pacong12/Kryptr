import { Test, type TestingModule } from '@nestjs/testing';
import type { KillSwitchState, Order } from '@kryptr/shared-types';
import { AppModule } from '../app/app.module';
import { CreateWalletUseCase } from '../wallet/application/create-wallet.usecase';
import {
  DECISION_AUDIT,
  POLICY_PROVIDER,
  type DecisionAudit,
  type SecurityPolicyProvider,
} from '../security/application/ports';
import { AUTOMATION_ORIGIN } from './application/execute-order-slot.usecase';
import { JOB_QUEUE } from './domain/job-queue.port';
import { ORDER_STORE, type OrderStore } from './domain/order-store.port';
import {
  EXECUTION_STORE,
  type ExecutionStore,
} from './domain/execution-store.port';
import { InMemoryJobQueue } from './infrastructure/in-memory-job-queue';
import { SchedulerTickUseCase } from './application/scheduler-tick.usecase';
import { OrdersController } from './orders.controller';
import { KillSwitchController } from './kill-switch.controller';
import { GetWorkerHealthUseCase } from './application/get-worker-health.usecase';
import { CreateOrderDto } from './dto/create-order.dto';

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const;

const ORIGINAL = {
  automationMode: process.env.AUTOMATION_MODE,
  priceFeedMode: process.env.PRICE_FEED_MODE,
  chainMode: process.env.CHAIN_MODE,
  dexSource: process.env.DEX_SOURCE,
  triggerPollMs: process.env.TRIGGER_POLL_MS,
};

function restoreEnv(): void {
  for (const [name, value] of Object.entries({
    AUTOMATION_MODE: ORIGINAL.automationMode,
    PRICE_FEED_MODE: ORIGINAL.priceFeedMode,
    CHAIN_MODE: ORIGINAL.chainMode,
    DEX_SOURCE: ORIGINAL.dexSource,
    TRIGGER_POLL_MS: ORIGINAL.triggerPollMs,
  })) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

describe('OrderWorkerModule wiring — AUTOMATION_MODE=disabled (default)', () => {
  let app: TestingModule;

  beforeAll(async () => {
    delete process.env.AUTOMATION_MODE;
    process.env.PRICE_FEED_MODE = 'static';
    process.env.CHAIN_MODE = 'static';
    process.env.DEX_SOURCE = 'static-mock';
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  it('fails the whole order surface closed with worker_unavailable (503)', async () => {
    const orders = app.get(OrdersController);
    const dto = Object.assign(new CreateOrderDto(), {
      type: 'dca',
      walletId: 'w-1',
      chain: 'base',
      baseAsset: null,
      quoteAsset: USDC,
      side: 'sell',
      amount: '1000',
      limitPrice: null,
      interval: 'P1D',
    });
    await expect(orders.create(dto)).rejects.toMatchObject({
      code: 'worker_unavailable',
      httpStatus: 503,
    });
    await expect(orders.findAll()).rejects.toMatchObject({
      code: 'worker_unavailable',
    });
    await expect(app.get(KillSwitchController).getState()).rejects.toMatchObject({
      code: 'worker_unavailable',
    });
  });

  it('GET /health/worker reports an honest not-ok envelope (no throw)', async () => {
    const health = await app.get(GetWorkerHealthUseCase).execute();
    expect(health).toMatchObject({
      component: 'order-worker',
      ok: false,
      detail: 'worker_unavailable',
    });
  });
});

describe('OrderWorkerModule wiring — AUTOMATION_MODE=in-memory (end to end)', () => {
  let app: TestingModule;
  let walletId: string;

  beforeAll(async () => {
    process.env.AUTOMATION_MODE = 'in-memory';
    process.env.PRICE_FEED_MODE = 'static';
    process.env.CHAIN_MODE = 'static';
    process.env.DEX_SOURCE = 'static-mock';
    // Keep the interval scheduler out of the test; ticks are driven manually.
    process.env.TRIGGER_POLL_MS = '3600000';
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await app.init();
    const wallet = await app.get(CreateWalletUseCase).execute({
      ownerId: 'worker-owner',
      address: '0x5555555555555555555555555555555555555555',
      chains: ['base'],
    });
    walletId = wallet.id;
    // Automation is OPT-IN per wallet: grant the worker origin explicitly
    // (the default policy denies it fail-closed — stage-A semantics).
    await app.get<SecurityPolicyProvider>(POLICY_PROVIDER).upsert({
      walletId,
      allowedOrigins: ['user', AUTOMATION_ORIGIN],
      approvalThresholdUsd: 500,
      dailyCapUsd: 1000,
      allowedChains: ['base'],
      rejectEncodedPayloads: true,
    });
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  function dcaDto(amount = '100000000000000000'): CreateOrderDto {
    return Object.assign(new CreateOrderDto(), {
      type: 'dca',
      walletId,
      chain: 'base',
      baseAsset: null,
      quoteAsset: USDC,
      side: 'sell',
      // 0.1 native ($300 static) — comfortably under the $1000 daily cap.
      // The deterministic static dex produces the SAME quote id for the
      // same request, so distinct orders vary the amount (single-use
      // quote rule, F2).
      amount,
      limitPrice: null,
      interval: 'P1D',
    });
  }

  it('creates an open order via the controller surface', async () => {
    const envelope = await app.get(OrdersController).create(dcaDto());
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toMatchObject({ type: 'dca', status: 'open' });
  });

  it('tick → claim → gate → unsigned execution; order fills at the dry-run boundary', async () => {
    const orders = app.get(OrdersController);
    const created = await orders.create(dcaDto('150000000000000000'));
    const order = created.data as Order;
    // Age the order so the current slot is due (anchor = createdAt).
    const store = app.get<OrderStore>(ORDER_STORE);
    await store.save({
      ...order,
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    });

    const evaluations = await app.get(SchedulerTickUseCase).execute();
    const mine = evaluations.filter((e) => e.orderId === order.id);
    expect(mine.map((e) => e.outcome)).toEqual(['triggered']);

    await app.get<InMemoryJobQueue>(JOB_QUEUE).drain();

    const executions = app.get<ExecutionStore>(EXECUTION_STORE);
    const records = await executions.findByOrderId(order.id);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      status: 'submitted',
      intentId: expect.stringMatching(/^intent:.*:/),
    });
    expect(records[0].detail).toContain('dry-run boundary');

    const after = await orders.findOne(order.id);
    expect(after.data?.status).toBe('filled');

    // The gate audited an APPROVED decision for the automation intent.
    const audit = app.get<DecisionAudit>(DECISION_AUDIT);
    const entries = await audit.findByIntentId(records[0].intentId as string);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].result).toBe('approved');

    // Timeline surface: executions endpoint returns the claim record.
    const timeline = await orders.executions(order.id);
    expect(timeline.data).toHaveLength(1);
  });

  it('kill switch: DeckUI shape in, KillSwitchState out, audit recorded', async () => {
    const controller = app.get(KillSwitchController);
    const openOrder = await app.get(OrdersController).create(dcaDto());

    const envelope = await controller.setMode({
      mode: 'cancel_active',
      reason: 'halt for test',
    } as never);
    const state = envelope.data as KillSwitchState;
    expect(state.mode).toBe('cancel_active');
    expect(state.reason).toBe('halt for test');
    expect(state.activatedAt).not.toBeNull();

    // Ack-first fan-out: give the fire-and-forget cancellation a turn.
    await app.get<InMemoryJobQueue>(JOB_QUEUE).drain();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const cancelled = await app
      .get(OrdersController)
      .findOne((openOrder.data as Order).id);
    expect(cancelled.data?.status).toBe('cancelled');

    const auditEnvelope = await controller.getAudit();
    expect(auditEnvelope.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor: 'backoffice:deck',
          from: 'off',
          to: 'cancel_active',
          reason: 'halt for test',
        }),
      ]),
    );

    // While cancel_active is on, no new orders at all.
    await expect(
      app.get(OrdersController).create(dcaDto()),
    ).rejects.toMatchObject({ code: 'kill_switch_active' });

    // Switch off again for any later blocks.
    await controller.setMode({ mode: 'off', reason: 'resume' } as never);
  });
});
