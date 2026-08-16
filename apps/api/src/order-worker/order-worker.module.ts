import {
  Inject,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { ChainModule } from '../chain/chain.module';
import { SecurityModule } from '../security/security.module';
import { TradingModule } from '../trading/trading.module';
import { WalletModule } from '../wallet/wallet.module';
import { PRICE_FEED, type PriceFeedPort } from '../security/application/ports';
import { ORDER_STORE, type OrderStore } from './domain/order-store.port';
import {
  EXECUTION_STORE,
  type ExecutionStore,
} from './domain/execution-store.port';
import { KILL_SWITCH, type KillSwitchPort } from './domain/kill-switch.port';
import {
  TRIGGER_HINT,
  TRIGGER_PRICE,
  type TriggerPricePort,
} from './domain/trigger-price.port';
import { JOB_QUEUE, type JobQueuePort } from './domain/job-queue.port';
import { InMemoryOrderStore } from './infrastructure/in-memory-order.store';
import { InMemoryExecutionStore } from './infrastructure/in-memory-execution.store';
import { InMemoryKillSwitch } from './infrastructure/in-memory-kill-switch';
import { InMemoryJobQueue } from './infrastructure/in-memory-job-queue';
import { UnavailableJobQueue } from './infrastructure/unavailable-job-queue';
import { makeUnavailable } from './infrastructure/unavailable-stub';
import {
  BullMqJobQueue,
  parseRedisUrl,
} from './infrastructure/bullmq-job-queue';
import { createExecutionWorker } from './infrastructure/bullmq-execution-worker';
import { StaticTriggerPrice } from './infrastructure/static-trigger-price';
import { ChainlinkTriggerPrice } from './infrastructure/chainlink-trigger-price';
import { ViemChainlinkReader } from './infrastructure/viem-chainlink-reader';
import { PriceFeedTriggerHint } from './infrastructure/price-feed-trigger-hint';
import { CreateOrderUseCase } from './application/create-order.usecase';
import { CancelOrderUseCase } from './application/cancel-order.usecase';
import { SetKillSwitchUseCase } from './application/set-kill-switch.usecase';
import { SchedulerTickUseCase } from './application/scheduler-tick.usecase';
import { ExecuteOrderSlotUseCase } from './application/execute-order-slot.usecase';
import { FinalizeFailedExecutionUseCase } from './application/finalize-failed-execution.usecase';
import { GetWorkerHealthUseCase } from './application/get-worker-health.usecase';
import { OrdersController } from './orders.controller';
import { KillSwitchController } from './kill-switch.controller';
import { WorkerHealthController } from './worker-health.controller';

export const TRIGGER_QUEUE_NAME = 'automation.trigger';

/**
 * Composition root for order automation (wave 4, stage B).
 * AUTOMATION_MODE (wiring-time env):
 *  - 'disabled'  (default) — endpoints stay registered and fail closed
 *    with worker_unavailable (503).
 *  - 'in-memory' — direct dispatch + interval scheduler; dev/demo.
 *  - 'bullmq'    — automation.trigger repeatable scheduler +
 *    automation.execute consumer over REDIS_URL.
 *
 * TRIGGER_SOURCE (bullmq only): 'chainlink' (default) reads Base Data
 * Feeds via viem; 'static' keeps the hermetic dev print.
 *
 * Security invariants baked into the wiring: every execution is a NEW
 * gate-evaluated intent (ExecuteOrderSlotUseCase -> EvaluateIntentUseCase),
 * the kill switch is checked at claim time, and nothing behind this
 * module ever signs or holds a key.
 */
@Module({
  imports: [WalletModule, SecurityModule, TradingModule, ChainModule],
  controllers: [OrdersController, KillSwitchController, WorkerHealthController],
  providers: [
    {
      provide: ORDER_STORE,
      useFactory: (): OrderStore =>
        (process.env.AUTOMATION_MODE ?? 'disabled') === 'disabled'
          ? makeUnavailable<OrderStore>('order store')
          : new InMemoryOrderStore(),
    },
    {
      provide: EXECUTION_STORE,
      useFactory: (): ExecutionStore =>
        (process.env.AUTOMATION_MODE ?? 'disabled') === 'disabled'
          ? makeUnavailable<ExecutionStore>('execution store')
          : new InMemoryExecutionStore(),
    },
    {
      provide: KILL_SWITCH,
      useFactory: (): KillSwitchPort =>
        (process.env.AUTOMATION_MODE ?? 'disabled') === 'disabled'
          ? makeUnavailable<KillSwitchPort>('kill switch')
          : new InMemoryKillSwitch(),
    },
    {
      provide: TRIGGER_PRICE,
      useFactory: (): TriggerPricePort => {
        const mode = process.env.AUTOMATION_MODE ?? 'disabled';
        const source =
          process.env.TRIGGER_SOURCE ??
          (mode === 'bullmq' ? 'chainlink' : 'static');
        if (source === 'chainlink') {
          return new ChainlinkTriggerPrice(
            new ViemChainlinkReader({
              rpcUrl: process.env.RPC_URL_BASE || undefined,
            }),
          );
        }
        return new StaticTriggerPrice();
      },
    },
    {
      provide: TRIGGER_HINT,
      inject: [PRICE_FEED],
      useFactory: (priceFeed: PriceFeedPort): TriggerPricePort =>
        new PriceFeedTriggerHint(priceFeed),
    },
    {
      provide: JOB_QUEUE,
      useFactory: (): JobQueuePort => {
        const mode = process.env.AUTOMATION_MODE ?? 'disabled';
        if (mode === 'bullmq') {
          return BullMqJobQueue.fromEnv();
        }
        if (mode === 'in-memory') {
          return new InMemoryJobQueue();
        }
        return new UnavailableJobQueue();
      },
    },
    CreateOrderUseCase,
    CancelOrderUseCase,
    SetKillSwitchUseCase,
    SchedulerTickUseCase,
    ExecuteOrderSlotUseCase,
    FinalizeFailedExecutionUseCase,
    GetWorkerHealthUseCase,
  ],
})
export class OrderWorkerModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderWorkerModule.name);
  private executionWorker?: Worker;
  private triggerQueue?: Queue;
  private triggerWorker?: Worker;
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(JOB_QUEUE) private readonly jobQueue: JobQueuePort,
    private readonly executeOrderSlot: ExecuteOrderSlotUseCase,
    private readonly finalizeFailedExecution: FinalizeFailedExecutionUseCase,
    private readonly schedulerTick: SchedulerTickUseCase,
  ) {}

  async onModuleInit(): Promise<void> {
    const mode = process.env.AUTOMATION_MODE ?? 'disabled';
    const pollMs = Number(process.env.TRIGGER_POLL_MS ?? 30_000);

    if (mode === 'in-memory' && this.jobQueue instanceof InMemoryJobQueue) {
      this.jobQueue.setDispatcher((input) =>
        this.executeOrderSlot.execute(input).then(() => undefined),
      );
      this.timer = setInterval(() => {
        void this.schedulerTick
          .execute()
          .catch((error) =>
            this.logger.error(`scheduler tick failed: ${String(error)}`),
          );
      }, pollMs);
      this.timer.unref?.();
      this.logger.log(`automation in-memory (scheduler every ${pollMs}ms)`);
      return;
    }

    if (mode === 'bullmq') {
      // L6: actionable config errors, never an opaque `new URL('')`.
      const connection = {
        ...parseRedisUrl(process.env.REDIS_URL),
        maxRetriesPerRequest: null,
      };
      this.executionWorker = createExecutionWorker({
        connection,
        executeOrderSlot: this.executeOrderSlot,
        // M1: retry-exhaustion finalizer (freeze §1 triggered -> failed).
        onRetryExhausted: (input) =>
          this.finalizeFailedExecution
            .execute(input)
            .catch((error) =>
              this.logger.error(
                `retry-exhaustion finalizer failed for ${input.orderId}:${input.slotKey}: ${String(error)}`,
              ),
            ),
      });
      this.triggerQueue = new Queue(TRIGGER_QUEUE_NAME, { connection });
      await this.triggerQueue.upsertJobScheduler(
        'scheduler-tick',
        { every: pollMs },
        {
          opts: {
            removeOnComplete: { count: 10 },
            removeOnFail: { count: 10 },
          },
        },
      );
      this.triggerWorker = new Worker(
        TRIGGER_QUEUE_NAME,
        async () => {
          await this.schedulerTick.execute();
        },
        { connection },
      );
      this.logger.log(
        `automation on bullmq (trigger every ${pollMs}ms, redis ${connection.host}:${connection.port})`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }
    await this.executionWorker?.close();
    await this.triggerWorker?.close();
    await this.triggerQueue?.close();
    if (this.jobQueue instanceof BullMqJobQueue) {
      await this.jobQueue.close();
    }
  }
}
