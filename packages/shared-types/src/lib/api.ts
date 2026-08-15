/** Uniform API envelope shared by api, backoffice and frontoffice. */
export interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  error: ApiError | null;
}

export interface ApiError {
  code: string;
  message: string;
  /** Machine-readable hint for agent consumers. */
  agentHint?: string;
}

export interface HealthStatus {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  version: string;
  uptimeSec: number;
}

export function ok<T>(data: T): ApiEnvelope<T> {
  return { ok: true, data, error: null };
}

export function err<T>(error: ApiError): ApiEnvelope<T> {
  return { ok: false, data: null, error };
}
