import { ref } from 'vue';
import type {
  ApiError,
  SecurityDecision,
  TransactionIntent,
} from '@kryptr/shared-types';
import { apiPost, isNetworkError } from '@/lib/api';

/**
 * Owns the transfer flow: POSTs a TransactionIntent to the security gate
 * and exposes the SecurityDecision. Components never fetch directly.
 *
 * Security stance: when the gate is unreachable the transfer is BLOCKED —
 * an intent must never bypass the gate (see docs/ROADMAP.md non-goals).
 */
export function useTransfer() {
  const submitting = ref(false);
  const decision = ref<SecurityDecision | null>(null);
  const error = ref<ApiError | null>(null);
  const gateUnreachable = ref(false);

  async function evaluate(intent: TransactionIntent): Promise<void> {
    submitting.value = true;
    decision.value = null;
    error.value = null;
    gateUnreachable.value = false;
    const result = await apiPost<SecurityDecision>(
      '/security/evaluate',
      intent,
    );
    if (result.ok && result.data) {
      decision.value = result.data;
    } else if (isNetworkError(result.error)) {
      gateUnreachable.value = true;
      error.value = result.error;
    } else {
      error.value = result.error ?? {
        code: 'unknown',
        message: 'Security evaluation failed.',
      };
    }
    submitting.value = false;
  }

  function reset(): void {
    decision.value = null;
    error.value = null;
    gateUnreachable.value = false;
  }

  return { submitting, decision, error, gateUnreachable, evaluate, reset };
}
