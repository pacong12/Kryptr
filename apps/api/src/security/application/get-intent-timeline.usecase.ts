import { Inject, Injectable } from '@nestjs/common';
import type { IntentTimelineStep } from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import {
  DECISION_AUDIT,
  INTENT_STORE,
  type DecisionAudit,
  type IntentStore,
} from './ports';

/**
 * Assembles the backoffice timeline for an intent (GET
 * /security/intents/:id/timeline): the 'created' step from the stored
 * intent, one 'gate_decision' step per audit entry, and wave-3 signer
 * steps ('sign_requested'/'dry_run_signed') — merged chronologically.
 */
@Injectable()
export class GetIntentTimelineUseCase {
  constructor(
    @Inject(INTENT_STORE) private readonly intentStore: IntentStore,
    @Inject(DECISION_AUDIT) private readonly decisionAudit: DecisionAudit,
  ) {}

  async execute(intentId: string): Promise<IntentTimelineStep[]> {
    const intent = await this.intentStore.findById(intentId);
    if (!intent) {
      throw new DomainError(
        'intent_not_found',
        `intent "${intentId}" does not exist`,
        404,
      );
    }
    const entries = await this.decisionAudit.findByIntentId(intentId);
    const signEvents =
      await this.decisionAudit.findSignEventsByIntentId(intentId);
    const steps: Array<IntentTimelineStep & { order: number }> = [
      ...entries.map(
        (entry, index): IntentTimelineStep & { order: number } => ({
          step: 'gate_decision',
          at: entry.decidedAt,
          actor: 'gate',
          detail: entry.reason,
          order: index,
        }),
      ),
      ...signEvents.map(
        (event, index): IntentTimelineStep & { order: number } => ({
          step: event.step,
          at: event.at,
          actor: 'signer',
          detail: event.detail,
          order: entries.length + index,
        }),
      ),
    ];
    steps.sort(
      (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.order - b.order,
    );
    return [
      {
        step: 'created',
        at: intent.createdAt,
        actor: intent.origin,
        detail: `${intent.kind} intent received`,
      },
      ...steps.map(({ order: _order, ...step }) => step),
    ];
  }
}
