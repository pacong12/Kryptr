import { describe, expect, it } from 'vitest';
import { WORKER_ERROR_CODES } from '@kryptr/shared-types';
import { WORKER_ERROR_MESSAGE_COUNT, workerErrorMeta } from './workerErrors';

describe('workerErrorMeta (human copy, never stack traces)', () => {
  it('covers EVERY frozen WORKER_ERROR_CODES member (freeze §2)', () => {
    // Parity guard: adding a code to the freeze without copy fails typecheck
    // AND this assertion.
    expect(WORKER_ERROR_MESSAGE_COUNT).toBe(WORKER_ERROR_CODES.length);
    for (const code of WORKER_ERROR_CODES) {
      const meta = workerErrorMeta({ code, message: 'raw envelope text' });
      expect(meta.title.length).toBeGreaterThan(0);
      expect(meta.message.length).toBeGreaterThan(0);
      // The envelope's raw message must be replaced by human copy.
      expect(meta.message).not.toBe('raw envelope text');
    }
  });

  it('renders meaningful copy for the degradation headline codes', () => {
    expect(
      workerErrorMeta({ code: 'worker_unavailable', message: '' }).title,
    ).toBe('Order worker unavailable');
    expect(
      workerErrorMeta({ code: 'order_type_unsupported', message: '' }).message,
    ).toContain('limit and DCA');
    expect(
      workerErrorMeta({ code: 'kill_switch_active', message: '' }).message,
    ).toContain('kill switch');
  });

  it('falls back to the envelope message for unknown codes', () => {
    const meta = workerErrorMeta({
      code: 'some_future_code',
      message: 'Something specific happened.',
    });
    expect(meta.title).toBe('Order action failed');
    expect(meta.message).toBe('Something specific happened.');
  });

  it('handles a null error without crashing', () => {
    const meta = workerErrorMeta(null);
    expect(meta.title).toBe('Something went wrong');
    expect(meta.message).toContain('No changes were made');
  });
});
