import type {
  KillSwitchAuditEntry,
  KillSwitchMode,
  KillSwitchState,
} from '@kryptr/shared-types';
import type { KillSwitchPort } from '../domain/kill-switch.port';
import { getPrismaClient } from '../../persistence/prisma-client';
import type { PrismaClient } from '../../generated/prisma/client';
import { DomainError } from '../../common/domain-error';

/**
 * Postgres-backed KillSwitch store (Wave-6 S1 persistence fase 2).
 * Singleton pattern: `kill_switch_state` table with `id = 1`.
 * `setMode` executes inside a single transaction to update state and append to audit atomically.
 */
export class PostgresKillSwitch implements KillSwitchPort {
  constructor(private readonly db: PrismaClient = getPrismaClient()) {}

  async getState(): Promise<KillSwitchState> {
    let row = await this.db.killSwitchState.findUnique({
      where: { id: 1 },
    });

    if (!row) {
      row = await this.db.killSwitchState.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          mode: 'off',
          activatedAt: null,
          reason: null,
          version: 0,
        },
        update: {},
      });
    }

    return {
      mode: row.mode as KillSwitchMode,
      activatedAt: row.activatedAt ? row.activatedAt.toISOString() : null,
      reason: row.reason ?? null,
      version: row.version,
    };
  }

  async setMode(
    mode: KillSwitchMode,
    input: { actor: string; reason: string; at: string },
  ): Promise<KillSwitchState> {
    return this.db.$transaction(async (tx) => {
      let current = await tx.killSwitchState.findUnique({
        where: { id: 1 },
      });

      if (!current) {
        current = await tx.killSwitchState.create({
          data: {
            id: 1,
            mode: 'off',
            activatedAt: null,
            reason: null,
            version: 0,
          },
        });
      }

      const fromMode = current.mode;
      const activatedAt = mode === 'off' ? null : new Date(input.at);
      const reason = mode === 'off' ? null : input.reason;

      const updated = await tx.killSwitchState.update({
        where: { id: 1 },
        data: {
          mode,
          activatedAt,
          reason,
          version: { increment: 1 },
          updatedBy: input.actor,
        },
      });

      await tx.killSwitchAudit.create({
        data: {
          fromMode,
          toMode: mode,
          actor: input.actor,
          reason: input.reason,
          at: new Date(input.at),
        },
      });

      return {
        mode: updated.mode as KillSwitchMode,
        activatedAt: updated.activatedAt
          ? updated.activatedAt.toISOString()
          : null,
        reason: updated.reason ?? null,
        version: updated.version,
      };
    });
  }

  async getAudit(): Promise<KillSwitchAuditEntry[]> {
    const rows = await this.db.killSwitchAudit.findMany({
      orderBy: { id: 'asc' },
    });

    return rows.map((r) => ({
      id: Number(r.id),
      fromMode: r.fromMode as KillSwitchMode,
      toMode: r.toMode as KillSwitchMode,
      actor: r.actor,
      reason: r.reason ?? null,
      at: r.at.toISOString(),
    }));
  }
}
