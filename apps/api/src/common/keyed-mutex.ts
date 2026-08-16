/**
 * Promise-chain mutex keyed by an arbitrary string (wave 4, security
 * entry criterion F1). Serializes a critical section per key without
 * blocking independent keys; a rejection inside one section never
 * poisons the queue. Used to make the gate's read-check-record cap path
 * atomic per wallet on a single instance. The Postgres era replaces it
 * with an atomic compare-and-reserve inside the ledger itself.
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<void>>();

  runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const result = prev.then(fn);
    // Swallow the section outcome for chaining purposes only — callers
    // still observe the original rejection via `result`.
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    });
    return result;
  }
}
