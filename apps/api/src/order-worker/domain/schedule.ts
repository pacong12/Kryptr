/**
 * ISO-8601 duration subset used by order intervals ('P1D', 'PT1H',
 * 'P1WT12H', ...). Returns null for anything outside the subset —
 * order creation rejects such intervals explicitly.
 */
const ISO_DURATION =
  /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

export function isoDurationToMs(iso: string): number | null {
  const match = ISO_DURATION.exec(iso);
  if (!match) {
    return null;
  }
  const [, weeks, days, hours, minutes, seconds] = match;
  if (!weeks && !days && !hours && !minutes && !seconds) {
    return null; // bare 'P' / 'PT' carry no magnitude
  }
  if (iso.includes('T') && !hours && !minutes && !seconds) {
    return null; // ISO-8601: 'T' requires >=1 time component ('P1DT' invalid)
  }
  return (
    Number(weeks ?? 0) * 7 * 86_400_000 +
    Number(days ?? 0) * 86_400_000 +
    Number(hours ?? 0) * 3_600_000 +
    Number(minutes ?? 0) * 60_000 +
    Number(seconds ?? 0) * 1_000
  );
}

/**
 * Deterministic DCA slot for the current time: slot n covers
 * [anchor + n·interval, anchor + (n+1)·interval). The slot KEY is the
 * ISO timestamp of the slot start — stable across schedulers and
 * restarts, exactly like the claim ids built from it.
 */
export function dcaSlotFor(input: {
  createdAtMs: number;
  intervalMs: number;
  nowMs: number;
}): { slotKey: string; slotStartMs: number } {
  const elapsed = Math.max(0, input.nowMs - input.createdAtMs);
  const n = Math.floor(elapsed / input.intervalMs);
  const slotStartMs = input.createdAtMs + n * input.intervalMs;
  return {
    slotKey: new Date(slotStartMs).toISOString(),
    slotStartMs,
  };
}
