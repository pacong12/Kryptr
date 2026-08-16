import { DomainError } from '../../common/domain-error';

/**
 * AUTOMATION_MODE=disabled binding for the state ports. Every method
 * fails closed with worker_unavailable (503) — an order surface that
 * can never execute is honest about it instead of accepting work it
 * will drop. The API surface stays registered and stable across modes.
 */
export function makeUnavailable<T extends object>(what: string): T {
  // Nest probes instances for lifecycle hooks by property access; the
  // proxy must NOT answer those with a callable or shutdown calls them.
  const INERT = new Set<string | symbol>([
    'then',
    'onModuleInit',
    'onModuleDestroy',
    'onApplicationBootstrap',
    'beforeApplicationShutdown',
    'onApplicationShutdown',
  ]);
  return new Proxy({} as T, {
    get: (_target, prop) => {
      if (INERT.has(prop)) {
        return undefined;
      }
      return () => {
        throw new DomainError(
          'worker_unavailable',
          `automation is disabled (${what} unavailable)`,
          503,
        );
      };
    },
  });
}
