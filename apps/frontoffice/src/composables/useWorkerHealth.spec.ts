import { describe, expect, it } from 'vitest';
import { effectScope } from 'vue';
import type { WorkerHealth } from '@kryptr/shared-types';
import { err, ok } from '@kryptr/shared-types';
import { useWorkerHealth } from './useWorkerHealth';
import { createStubOrdersSource, type OrdersSource } from '@/lib/orders';

function healthSource(
  health: () => ReturnType<OrdersSource['health']>,
): OrdersSource {
  return {
    list: async () => err({ code: 'worker_unavailable', message: '' }),
    health,
    create: async () => err({ code: 'worker_unavailable', message: '' }),
  };
}

function mountComposable(source?: OrdersSource) {
  const scope = effectScope();
  const api = scope.run(() => useWorkerHealth(source));
  if (!api) throw new Error('composable failed to mount');
  return { api, stop: () => scope.stop() };
}

describe('useWorkerHealth (health signal only, fail-closed)', () => {
  it('reports the stub deployment as down (never guessed healthy)', async () => {
    const { api, stop } = mountComposable(createStubOrdersSource());

    await api.refresh();

    expect(api.state.value).toBe('ready');
    expect(api.workerDown.value).toBe(true);
    expect(api.workerHealth.value?.ok).toBe(false);
    stop();
  });

  it('reports a healthy worker card as operational', async () => {
    const card: WorkerHealth = {
      component: 'order-worker',
      ok: true,
      checkedAt: '2026-08-17T00:00:00.000Z',
    };
    const { api, stop } = mountComposable(healthSource(async () => ok(card)));

    await api.refresh();

    expect(api.state.value).toBe('ready');
    expect(api.workerDown.value).toBe(false);
    stop();
  });

  it('fails closed when the health endpoint itself is unreachable', async () => {
    const { api, stop } = mountComposable(
      healthSource(async () =>
        err({ code: 'network_error', message: 'unreachable' }),
      ),
    );

    await api.refresh();

    expect(api.state.value).toBe('error');
    expect(api.workerHealth.value).toBeNull();
    expect(api.error.value?.code).toBe('network_error');
    stop();
  });
});
