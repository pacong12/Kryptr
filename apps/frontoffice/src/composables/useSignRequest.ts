import { ref } from 'vue';
import type { ApiError, SignRequest } from '@kryptr/shared-types';
import { apiPost } from '@/lib/api';

/**
 * Prepares a dry-run signature request for an intent that already passed the
 * security gate. Display-only: wave 3 never signs and never broadcasts — the
 * composable surfaces the SignRequest envelope (unsigned tx echo, digest,
 * signer note) and nothing more. Fails closed like every other gate call:
 * an unreachable endpoint is an error state, never a silent skip.
 */
export function useSignRequest() {
  const requesting = ref(false);
  const signRequest = ref<SignRequest | null>(null);
  const error = ref<ApiError | null>(null);

  async function request(intentId: string): Promise<void> {
    requesting.value = true;
    error.value = null;
    const result = await apiPost<SignRequest>(
      `/security/intents/${intentId}/sign-request`,
      {},
    );
    requesting.value = false;
    if (result.ok && result.data) {
      signRequest.value = result.data;
    } else {
      signRequest.value = null;
      error.value = result.error ?? {
        code: 'unknown',
        message: 'Unable to prepare the dry-run signature.',
      };
    }
  }

  /** Drop a previous request (the form changed, so it is stale). */
  function reset(): void {
    requesting.value = false;
    signRequest.value = null;
    error.value = null;
  }

  return { requesting, signRequest, error, request, reset };
}
