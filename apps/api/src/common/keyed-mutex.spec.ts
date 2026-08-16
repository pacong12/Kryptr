// Node 22 ships Promise.withResolvers; the project lib (es2022)
// predates its types, so declare the slice this spec uses.
declare global {
  interface PromiseConstructor {
    withResolvers<T>(): {
      promise: Promise<T>;
      resolve: (value: T) => void;
      reject: (reason?: unknown) => void;
    };
  }
}

import { KeyedMutex } from './keyed-mutex';

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

describe('KeyedMutex', () => {
  it('serializes same-key sections in acquisition order', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    const run = (label: string, delay: number) =>
      mutex.runExclusive('wallet-1', async () => {
        order.push(`${label}:start`);
        await sleep(delay);
        order.push(`${label}:end`);
      });
    await Promise.all([run('a', 10), run('b', 5)]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('independent keys do not block each other', async () => {
    const mutex = new KeyedMutex();
    const events: string[] = [];
    await Promise.all([
      mutex.runExclusive('k1', async () => {
        events.push('k1:start');
        await sleep(15);
        events.push('k1:end');
      }),
      mutex.runExclusive('k2', async () => {
        events.push('k2:start');
        await sleep(5);
        events.push('k2:end');
      }),
    ]);
    // k2 finishes before k1 despite starting "later" — no cross-key lock
    expect(events.indexOf('k2:end')).toBeLessThan(events.indexOf('k1:end'));
  });

  it('a failing section does not poison the queue for the key', async () => {
    const mutex = new KeyedMutex();
    await expect(
      mutex.runExclusive('w', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(mutex.runExclusive('w', async () => 'ok')).resolves.toBe(
      'ok',
    );
  });
});
