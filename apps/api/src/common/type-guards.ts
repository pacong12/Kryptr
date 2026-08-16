/**
 * Canonical runtime type guards for the api package. Wire payloads
 * ignore TypeScript — gates and adapters shape-guard untrusted data
 * instead of crashing. Import from here; never recreate these guards
 * at individual call sites.
 */

/** True for plain objects (not null, not arrays); fields stay unknown. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
