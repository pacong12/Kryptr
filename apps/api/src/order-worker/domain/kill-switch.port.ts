import type {
  KillSwitchAuditEntry,
  KillSwitchMode,
  KillSwitchState,
} from '@kryptr/shared-types';

/**
 * Global kill switch (freeze §3) — checked at EXECUTION time (claim),
 * not only at scheduling. Every transition is audited. The audit entry
 * shape is the shared contract for Deck + Face (shared-types).
 */

export const KILL_SWITCH = 'order-worker.kill-switch';

export interface KillSwitchPort {
  getState(): Promise<KillSwitchState>;
  setMode(
    mode: KillSwitchMode,
    input: { actor: string; reason: string; at: string },
  ): Promise<KillSwitchState>;
  getAudit(): Promise<KillSwitchAuditEntry[]>;
}
