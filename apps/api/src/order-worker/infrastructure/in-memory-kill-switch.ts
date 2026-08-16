import type {
  KillSwitchAuditEntry,
  KillSwitchMode,
  KillSwitchState,
} from '@kryptr/shared-types';
import type { KillSwitchPort } from '../domain/kill-switch.port';

/** In-memory global kill switch with an append-only transition audit. */
export class InMemoryKillSwitch implements KillSwitchPort {
  private state: KillSwitchState = {
    mode: 'off',
    activatedAt: null,
    reason: null,
  };
  private readonly audit: KillSwitchAuditEntry[] = [];

  async getState(): Promise<KillSwitchState> {
    return { ...this.state };
  }

  async setMode(
    mode: KillSwitchMode,
    input: { actor: string; reason: string; at: string },
  ): Promise<KillSwitchState> {
    const from = this.state.mode;
    this.state = {
      mode,
      activatedAt: mode === 'off' ? null : input.at,
      reason: mode === 'off' ? null : input.reason,
    };
    this.audit.push({
      actor: input.actor,
      from,
      to: mode,
      reason: input.reason,
      at: input.at,
    });
    return { ...this.state };
  }

  async getAudit(): Promise<KillSwitchAuditEntry[]> {
    return this.audit.map((entry) => ({ ...entry }));
  }
}
