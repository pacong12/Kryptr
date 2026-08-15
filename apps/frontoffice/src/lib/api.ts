import type { ApiEnvelope, ApiError } from '@kryptr/shared-types';
import { err } from '@kryptr/shared-types';

/** Base URL of the Kryptr API; override per environment via VITE_API_URL. */
export const API_URL: string =
  import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

/** Global route prefix of `apps/api` (NestJS `setGlobalPrefix`). */
export const API_PREFIX = '/api';

/** Error code used when the API cannot be reached at all. */
export const NETWORK_ERROR_CODE = 'network_error';

function isEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    typeof value.ok === 'boolean'
  );
}

/**
 * Typed fetch wrapper around the Kryptr API. Every call resolves to an
 * `ApiEnvelope<T>`; network and parsing failures become typed error
 * envelopes, so components never have to catch thrown errors. Paths are
 * relative to the API's global route prefix (e.g. pass `/wallets`).
 */
async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiEnvelope<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${API_PREFIX}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...init.headers,
      },
    });
  } catch {
    return err<T>({
      code: NETWORK_ERROR_CODE,
      message: `Kryptr API is unreachable at ${API_URL}.`,
      agentHint: 'api_unreachable:fall_back_to_fixture_data',
    });
  }

  let payload: unknown = null;
  try {
    const text = await response.text();
    if (text.length > 0) {
      payload = JSON.parse(text);
    }
  } catch {
    payload = null;
  }

  // The API always answers in ApiEnvelope shape, including error cases.
  if (isEnvelope(payload)) {
    return payload as ApiEnvelope<T>;
  }

  if (!response.ok) {
    return err<T>({
      code: `http_${response.status}`,
      message: `API request failed with HTTP ${response.status}.`,
    });
  }

  return err<T>({
    code: 'invalid_response',
    message: 'API returned a response without an ApiEnvelope shape.',
  });
}

export function apiGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<ApiEnvelope<T>> {
  return request<T>(path, { method: 'GET', signal });
}

export function apiPost<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<ApiEnvelope<T>> {
  return request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
}

export function isNetworkError(error: ApiError | null): boolean {
  return error?.code === NETWORK_ERROR_CODE;
}
