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
 * intent plus one 'gate_decision' step per append-only audit entry.
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
    return [
      {
        step: 'created',
        at: intent.createdAt,
        actor: intent.origin,
        detail: `${intent.kind} intent received`,
      },
      ...entries.map((entry): IntentTimelineStep => {
        return {
          step: 'gate_decision',
          at: entry.decidedAt,
          actor: 'gate',
          detail: entry.reason,
        };
      }),
    ];
  }
}
