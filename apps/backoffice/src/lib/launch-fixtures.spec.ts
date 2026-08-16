import { VERIFICATION_CLAIMS } from '@kryptr/shared-types';
import { describe, expect, it } from 'vitest';

import {
  LAUNCH_REVIEW_STATUSES,
  MOCK_FACTORY_HEALTH,
  MOCK_LAUNCH_REQUESTS,
  type LaunchRequest,
} from './fixtures';

/**
 * Wave-5 acceptance: launch fixtures must conform to the FROZEN wave-5
 * contract (gate #4) — the Q1 share↔bps mirror rule, the T21 claim
 * vocabulary, address shapes and the decision-field discipline. These
 * invariants keep fixture drift from masking a contract break.
 */

const ADDRESS = /^0x[0-9a-f]{40}$/;
const FEE_KEYS = ['creator', 'lp', 'protocol', 'buyback'] as const;

function shareFor(
  request: LaunchRequest,
  key: (typeof FEE_KEYS)[number],
): number {
  const schedule = request.context.feeSchedule;
  switch (key) {
    case 'creator':
      return schedule.creatorShare;
    case 'lp':
      return schedule.lpShare;
    case 'protocol':
      return schedule.protocolShare;
    case 'buyback':
      return schedule.buybackShare;
  }
}

describe('launch fixture invariants', () => {
  it('uses only frozen review statuses', () => {
    for (const request of MOCK_LAUNCH_REQUESTS) {
      expect(LAUNCH_REVIEW_STATUSES).toContain(request.status);
    }
  });

  it('keeps decision fields consistent with the status', () => {
    for (const request of MOCK_LAUNCH_REQUESTS) {
      if (request.status === 'pending_review') {
        expect(request.decidedAt).toBeNull();
        expect(request.decidedBy).toBeNull();
        expect(request.decisionReason).toBeNull();
      } else {
        expect(request.decidedAt).not.toBeNull();
        expect(request.decidedBy).not.toBeNull();
        expect(request.decisionReason).not.toBeNull();
      }
    }
  });

  it('satisfies the Q1 ruling: Math.round(share * 10_000) === bps', () => {
    for (const request of MOCK_LAUNCH_REQUESTS) {
      for (const key of FEE_KEYS) {
        const share = shareFor(request, key);
        const bps = request.context.feeBps[key];
        expect(bps).toBeGreaterThanOrEqual(0);
        expect(Math.round(share * 10_000)).toBe(bps);
      }
    }
  });

  it('uses positive integer raw supplies and well-formed addresses', () => {
    for (const request of MOCK_LAUNCH_REQUESTS) {
      const { context } = request;
      expect(context.totalSupply).toMatch(/^[1-9][0-9]*$/);
      expect(context.factory).toMatch(ADDRESS);
      for (const key of FEE_KEYS) {
        expect(context.feeRecipients[key]).toMatch(ADDRESS);
      }
    }
  });

  it('keeps verification claims within the frozen T21 vocabulary', () => {
    const verified = MOCK_LAUNCH_REQUESTS.filter(
      (request) => request.context.verification !== undefined,
    );
    expect(verified.length).toBeGreaterThan(0);
    for (const request of verified) {
      const claims = request.context.verification?.claims ?? [];
      expect(claims.length).toBeGreaterThan(0);
      for (const claim of claims) {
        expect(VERIFICATION_CLAIMS).toContain(claim.claim);
        expect(claim.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    }
  });
});

describe('factory health fixture', () => {
  it('references the same factory as the launch requests', () => {
    const factories = new Set(
      MOCK_LAUNCH_REQUESTS.map((request) => request.context.factory),
    );
    expect(factories.size).toBe(1);
    expect(MOCK_FACTORY_HEALTH.factory).toBe([...factories][0]);
  });

  it('counts pending reviews consistently with the feed fixture', () => {
    const pending = MOCK_LAUNCH_REQUESTS.filter(
      (request) => request.status === 'pending_review',
    ).length;
    expect(MOCK_FACTORY_HEALTH.pendingReviews).toBe(pending);
  });
});
