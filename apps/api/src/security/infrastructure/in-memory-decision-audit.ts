import type {
  DecisionAudit,
  DecisionAuditEntry,
  SignEventEntry,
} from '../application/ports';

/**
 * Append-only in-memory decision log. Every gate decision lands here
 * with its USD value fixed at decision time, so forensics and cap
 * accounting never depend on re-pricing. Replaced by a Postgres
 * implementation (with the same port) in the persistence task.
 */
export class InMemoryDecisionAudit implements DecisionAudit {
  private readonly entries: DecisionAuditEntry[] = [];
  private readonly signEvents: SignEventEntry[] = [];
  private sequence = 0;

  async append(
    entry: Omit<DecisionAuditEntry, 'id'>,
  ): Promise<DecisionAuditEntry> {
    this.sequence += 1;
    const stored: DecisionAuditEntry = {
      id: `decision-${this.sequence}`,
      ...entry,
    };
    this.entries.push(stored);
    return { ...stored };
  }

  async findByIntentId(intentId: string): Promise<DecisionAuditEntry[]> {
    return this.entries
      .filter((entry) => entry.intentId === intentId)
      .map((entry) => ({ ...entry }));
  }

  async appendSignEvent(
    entry: Omit<SignEventEntry, 'id'>,
  ): Promise<SignEventEntry> {
    this.sequence += 1;
    const stored: SignEventEntry = {
      id: `sign-event-${this.sequence}`,
      ...entry,
    };
    this.signEvents.push(stored);
    return { ...stored };
  }

  async findSignEventsByIntentId(intentId: string): Promise<SignEventEntry[]> {
    return this.signEvents
      .filter((event) => event.intentId === intentId)
      .map((event) => ({ ...event }));
  }
}
