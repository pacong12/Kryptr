import type {
  DecisionAudit,
  DecisionAuditEntry,
  SignEventEntry,
} from '../application/ports';
import { usdToMicros } from '../../common/micro-usd';
import { getPrismaClient } from '../../persistence/prisma-client';
import type { PrismaClient } from '../../generated/prisma/client';

/**
 * Postgres-backed append-only decision log (wave-6 S1 §3). Entries are
 * immutable once written — the API layer never updates or deletes them
 * (DB grants will enforce this later). decisionUsd crosses the boundary
 * as float per the port contract; storage is integer micro-USD.
 */
export class PostgresDecisionAudit implements DecisionAudit {
  constructor(private readonly db: PrismaClient = getPrismaClient()) {}

  async append(
    entry: Omit<DecisionAuditEntry, 'id'>,
  ): Promise<DecisionAuditEntry> {
    const row = await this.db.decisionAudit.create({
      data: {
        intentId: entry.intentId,
        result: entry.result,
        reason: entry.reason,
        decisionUsdMicros:
          entry.decisionUsd === null ? null : usdToMicros(entry.decisionUsd),
        decidedAt: new Date(entry.decidedAt),
      },
    });
    return toDecisionEntry(row);
  }

  async findByIntentId(intentId: string): Promise<DecisionAuditEntry[]> {
    const rows = await this.db.decisionAudit.findMany({
      where: { intentId },
      orderBy: { id: 'asc' },
    });
    return rows.map(toDecisionEntry);
  }

  async appendSignEvent(
    entry: Omit<SignEventEntry, 'id'>,
  ): Promise<SignEventEntry> {
    const row = await this.db.signEvent.create({
      data: {
        intentId: entry.intentId,
        step: entry.step,
        detail: entry.detail,
        at: new Date(entry.at),
      },
    });
    return toSignEvent(row);
  }

  async findSignEventsByIntentId(intentId: string): Promise<SignEventEntry[]> {
    const rows = await this.db.signEvent.findMany({
      where: { intentId },
      orderBy: { id: 'asc' },
    });
    return rows.map(toSignEvent);
  }
}

function toDecisionEntry(row: {
  id: bigint;
  intentId: string;
  result: string;
  reason: string;
  decisionUsdMicros: bigint | null;
  decidedAt: Date;
}): DecisionAuditEntry {
  return {
    id: row.id.toString(),
    intentId: row.intentId,
    result: row.result as DecisionAuditEntry['result'],
    reason: row.reason,
    decidedAt: row.decidedAt.toISOString(),
    decisionUsd:
      row.decisionUsdMicros === null
        ? null
        : Number(row.decisionUsdMicros) / 1_000_000,
  };
}

function toSignEvent(row: {
  id: bigint;
  intentId: string;
  step: string;
  detail: string | null;
  at: Date;
}): SignEventEntry {
  return {
    id: row.id.toString(),
    intentId: row.intentId,
    step: row.step as SignEventEntry['step'],
    detail: row.detail ?? '',
    at: row.at.toISOString(),
  };
}
