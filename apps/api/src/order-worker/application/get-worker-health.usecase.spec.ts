import { InMemoryKillSwitch } from '../infrastructure/in-memory-kill-switch';
import { InMemoryJobQueue } from '../infrastructure/in-memory-job-queue';
import { UnavailableJobQueue } from '../infrastructure/unavailable-job-queue';
import { GetWorkerHealthUseCase } from './get-worker-health.usecase';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');

describe('GetWorkerHealthUseCase', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW));
  });

  afterEach(() => jest.useRealTimers());

  it('ok when the queue is healthy and the switch is off', async () => {
    const usecase = new GetWorkerHealthUseCase(
      new InMemoryJobQueue(),
      new InMemoryKillSwitch(),
    );
    expect(await usecase.execute()).toEqual({
      component: 'order-worker',
      ok: true,
      checkedAt: new Date(NOW).toISOString(),
    });
  });

  it('an active kill switch overlays not-ok even on a healthy queue', async () => {
    const killSwitch = new InMemoryKillSwitch();
    await killSwitch.setMode('pause_new', {
      actor: 'deck',
      reason: 'halt',
      at: new Date(NOW).toISOString(),
    });
    const usecase = new GetWorkerHealthUseCase(new InMemoryJobQueue(), killSwitch);
    const health = await usecase.execute();
    expect(health.ok).toBe(false);
    expect(health.detail).toBe('kill_switch_active:pause_new');
  });

  it('disabled automation reports worker_unavailable', async () => {
    const usecase = new GetWorkerHealthUseCase(
      new UnavailableJobQueue(),
      new InMemoryKillSwitch(),
    );
    const health = await usecase.execute();
    expect(health.ok).toBe(false);
    expect(health.detail).toBe('worker_unavailable');
  });
});
