import { InMemoryDecisionAudit } from './in-memory-decision-audit';

describe('InMemoryDecisionAudit (append-only)', () => {
  it('appends entries with generated ids and returns them', async () => {
    const audit = new InMemoryDecisionAudit();
    const entry = await audit.append({
      intentId: 'intent-1',
      result: 'approved',
      reason: 'approved: within policy',
      decidedAt: '2026-05-01T00:00:01.000Z',
      decisionUsd: 30,
    });
    expect(entry.id).toEqual(expect.any(String));
    expect(entry.id.length).toBeGreaterThan(0);
    expect(entry).toMatchObject({ intentId: 'intent-1', decisionUsd: 30 });
  });

  it('returns all entries for an intent in append order', async () => {
    const audit = new InMemoryDecisionAudit();
    await audit.append({
      intentId: 'intent-1',
      result: 'needs_human_approval',
      reason: 'threshold',
      decidedAt: '2026-05-01T00:00:01.000Z',
      decisionUsd: 150,
    });
    await audit.append({
      intentId: 'intent-1',
      result: 'approved',
      reason: 'approved after human review',
      decidedAt: '2026-05-01T00:05:00.000Z',
      decisionUsd: 150,
    });
    await audit.append({
      intentId: 'intent-2',
      result: 'rejected',
      reason: 'origin',
      decidedAt: '2026-05-01T00:06:00.000Z',
      decisionUsd: null,
    });
    const entries = await audit.findByIntentId('intent-1');
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.result)).toEqual([
      'needs_human_approval',
      'approved',
    ]);
  });

  it('returns an empty list for unknown intents', async () => {
    const audit = new InMemoryDecisionAudit();
    await expect(audit.findByIntentId('nope')).resolves.toEqual([]);
  });

  it('returns copies: mutating results never alters the audit log', async () => {
    const audit = new InMemoryDecisionAudit();
    await audit.append({
      intentId: 'intent-1',
      result: 'approved',
      reason: 'ok',
      decidedAt: '2026-05-01T00:00:01.000Z',
      decisionUsd: 1,
    });
    const first = await audit.findByIntentId('intent-1');
    first.pop();
    first[0] = { ...first[0], reason: 'tampered' } as (typeof first)[number];
    const second = await audit.findByIntentId('intent-1');
    expect(second).toHaveLength(1);
    expect(second[0].reason).toBe('ok');
  });
});

describe('InMemoryDecisionAudit sign events (wave 3)', () => {
  it('appends sign events separately from decisions, in order', async () => {
    const audit = new InMemoryDecisionAudit();
    await audit.append({
      intentId: 'intent-1',
      result: 'approved',
      reason: 'approved: within policy',
      decidedAt: '2026-05-01T00:00:01.000Z',
      decisionUsd: 30,
    });
    await audit.appendSignEvent({
      intentId: 'intent-1',
      step: 'sign_requested',
      detail: 'sign request created',
      at: '2026-05-01T00:00:02.000Z',
    });
    await audit.appendSignEvent({
      intentId: 'intent-1',
      step: 'dry_run_signed',
      detail: 'dry-run only — nothing broadcast',
      at: '2026-05-01T00:00:03.000Z',
    });
    const events = await audit.findSignEventsByIntentId('intent-1');
    expect(events.map((event) => event.step)).toEqual([
      'sign_requested',
      'dry_run_signed',
    ]);
    // decisions stay decisions: sign events never leak into the
    // decision stream the gate and preview depend on.
    const decisions = await audit.findByIntentId('intent-1');
    expect(decisions).toHaveLength(1);
    expect(decisions[0].result).toBe('approved');
  });

  it('returns copies of sign events', async () => {
    const audit = new InMemoryDecisionAudit();
    await audit.appendSignEvent({
      intentId: 'intent-1',
      step: 'sign_requested',
      detail: 'x',
      at: '2026-05-01T00:00:02.000Z',
    });
    const first = await audit.findSignEventsByIntentId('intent-1');
    first.pop();
    await expect(
      audit.findSignEventsByIntentId('intent-1'),
    ).resolves.toHaveLength(1);
  });
});
