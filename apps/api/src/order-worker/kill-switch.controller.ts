import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ok,
  type ApiEnvelope,
  type KillSwitchAuditEntry,
  type KillSwitchState,
} from '@kryptr/shared-types';
import { SetKillSwitchUseCase } from './application/set-kill-switch.usecase';
import { KillSwitchDto } from './dto/kill-switch.dto';

/**
 * Kill switch surface (freeze §3) — audited server action consumed by
 * the backoffice deck. DeckUI posts exactly `{ mode, reason }` with a
 * 2.5s client timeout, so the POST acks after the state switch and the
 * cancel_active order fan-out runs asynchronously (order cancellations
 * are idempotent via the terminal-status guard).
 */
@Controller('automation/kill-switch')
export class KillSwitchController {
  constructor(private readonly setKillSwitch: SetKillSwitchUseCase) {}

  @Get()
  async getState(): Promise<ApiEnvelope<KillSwitchState>> {
    return ok(await this.setKillSwitch.getState());
  }

  @Post()
  async setMode(
    @Body() body: KillSwitchDto,
  ): Promise<ApiEnvelope<KillSwitchState>> {
    const state = await this.setKillSwitch.execute({
      mode: body.mode,
      actor: body.actor ?? 'backoffice:deck',
      reason: body.reason,
    });
    if (body.mode === 'cancel_active') {
      // Ack-first: never block the response on the order fan-out.
      void this.setKillSwitch.cancelOpenOrders().catch(() => undefined);
    }
    return ok(state);
  }

  @Get('audit')
  async getAudit(): Promise<ApiEnvelope<KillSwitchAuditEntry[]>> {
    return ok(await this.setKillSwitch.getAudit());
  }
}
