import type { Order, TriggerPricePrint } from '@kryptr/shared-types';
import {
  DEFAULT_TRIGGER_CONFIG,
  evaluateDcaSlot,
  evaluateLimitTrigger,
  LIMIT_SLOT_KEY,
} from './trigger-evaluation';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');

function limitOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ord-1',
    walletId: 'w-1',
    type: 'limit',
    status: 'open',
    chain: 'base',
    baseAsset: null,
    quoteAsset: '0x833589fcd6edb6e08f4c7c32d4f71b54bfa02913',
    side: 'buy',
    amount: '1000000',
    limitPrice: '3000',
    interval: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function print(
  priceUsd: string,
  ageMs = 0,
  source: TriggerPricePrint['source'] = 'static',
): TriggerPricePrint {
  return {
    source,
    priceUsd,
    observedAt: new Date(NOW - ageMs).toISOString(),
  };
}

describe('evaluateLimitTrigger (fail-closed outcome matrix)', () => {
  it('triggers a BUY when price falls to the limit', () => {
    const evaluation = evaluateLimitTrigger({
      order: limitOrder({ side: 'buy', limitPrice: '3000' }),
      primary: print('3000'),
      hint: print('3001'),
      nowMs: NOW,
    });
    expect(evaluation.outcome).toBe('triggered');
    expect(evaluation.slotKey).toBe(LIMIT_SLOT_KEY);
  });

  it('does not trigger a BUY above the limit (armed)', () => {
    const evaluation = evaluateLimitTrigger({
      order: limitOrder({ side: 'buy', limitPrice: '3000' }),
      primary: print('3100'),
      hint: print('3101'),
      nowMs: NOW,
    });
    expect(evaluation.outcome).toBe('armed');
  });

  it('triggers a SELL when price rises to the limit', () => {
    const evaluation = evaluateLimitTrigger({
      order: limitOrder({ side: 'sell', limitPrice: '3000' }),
      primary: print('3000'),
      hint: print('2999'),
      nowMs: NOW,
    });
    expect(evaluation.outcome).toBe('triggered');
  });

  it.each([
    ['primary', null as unknown as TriggerPricePrint, print('3000')],
    ['hint', print('3000'), null as unknown as TriggerPricePrint],
  ])('needs_human_approval when the %s source is missing', (_label, primary, hint) => {
    const evaluation = evaluateLimitTrigger({
      order: limitOrder(),
      primary: primary as TriggerPricePrint | null,
      hint: hint as TriggerPricePrint | null,
      nowMs: NOW,
    });
    expect(evaluation.outcome).toBe('needs_human_approval');
    expect(evaluation.detail).toContain('trigger_price_unknown');
  });

  it('needs_human_approval when both sources are missing', () => {
    const evaluation = evaluateLimitTrigger({
      order: limitOrder(),
      primary: null,
      hint: null,
      nowMs: NOW,
    });
    expect(evaluation.outcome).toBe('needs_human_approval');
    expect(evaluation.detail).toContain('both sources');
  });

  it('needs_human_approval on an unparseable print (never a stale pass)', () => {
    const evaluation = evaluateLimitTrigger({
      order: limitOrder(),
      primary: print('not-a-number'),
      hint: print('3000'),
      nowMs: NOW,
    });
    expect(evaluation.outcome).toBe('needs_human_approval');
  });

  it('skip_stale when the primary print exceeds max age', () => {
    const evaluation = evaluateLimitTrigger({
      order: limitOrder(),
      primary: print('3000', DEFAULT_TRIGGER_CONFIG.maxAgeMs + 1),
      hint: print('3000'),
      nowMs: NOW,
    });
    expect(evaluation.outcome).toBe('skip_stale');
    expect(evaluation.detail).toContain('primary');
  });

  it('skip_stale when the hint print exceeds max age', () => {
    const evaluation = evaluateLimitTrigger({
      order: limitOrder(),
      primary: print('3000'),
      hint: print('3000', DEFAULT_TRIGGER_CONFIG.maxAgeMs + 1),
      nowMs: NOW,
    });
    expect(evaluation.outcome).toBe('skip_stale');
    expect(evaluation.detail).toContain('hint');
  });

  it('skip_deviation when sources disagree beyond the bound', () => {
    const evaluation = evaluateLimitTrigger({
      order: limitOrder(),
      primary: print('3000'),
      hint: print('3020'), // ~66 bps > 50 bps default
      nowMs: NOW,
    });
    expect(evaluation.outcome).toBe('skip_deviation');
  });

  it('compares prices when deviation is within the bound', () => {
    const evaluation = evaluateLimitTrigger({
      order: limitOrder({ side: 'buy', limitPrice: '3010' }),
      primary: print('3000'),
      hint: print('3010'), // ~33 bps, inside 50 bps
      nowMs: NOW,
    });
    expect(evaluation.outcome).toBe('triggered');
  });

  it('needs_human_approval when limitPrice is missing or invalid', () => {
    for (const limitPrice of [null, 'abc', '0']) {
      const evaluation = evaluateLimitTrigger({
        order: limitOrder({ limitPrice }),
        primary: print('3000'),
        hint: print('3000'),
        nowMs: NOW,
      });
      expect(evaluation.outcome).toBe('needs_human_approval');
    }
  });

  it('records both prints and the evaluation clock on the outcome', () => {
    const primary = print('3000');
    const hint = print('3001');
    const evaluation = evaluateLimitTrigger({
      order: limitOrder(),
      primary,
      hint,
      nowMs: NOW,
    });
    expect(evaluation.primary).toEqual(primary);
    expect(evaluation.hint).toEqual(hint);
    expect(evaluation.evaluatedAt).toBe(new Date(NOW).toISOString());
    expect(evaluation.orderId).toBe('ord-1');
  });
});

describe('evaluateDcaSlot', () => {
  it('is time-triggered: slot due regardless of print availability', () => {
    const order = limitOrder({ type: 'dca', interval: 'P1D', limitPrice: null });
    const withPrints = evaluateDcaSlot({
      order,
      slotKey: '2026-05-01T00:00:00.000Z',
      primary: print('3000'),
      hint: print('3001'),
      nowMs: NOW,
    });
    const withoutPrints = evaluateDcaSlot({
      order,
      slotKey: '2026-05-01T00:00:00.000Z',
      primary: null,
      hint: null,
      nowMs: NOW,
    });
    expect(withPrints.outcome).toBe('triggered');
    expect(withoutPrints.outcome).toBe('triggered');
    expect(withoutPrints.detail).toContain('fail-closed');
  });
});
