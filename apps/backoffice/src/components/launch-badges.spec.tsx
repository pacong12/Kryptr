import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LAUNCH_REVIEW_STATUSES, MOCK_LAUNCH_REQUESTS } from '@/lib/fixtures';
import { humanize } from '@/lib/format';

import {
  BondPaidBadge,
  LaunchStatusBadge,
  VerificationClaimBadge,
} from './launch-badges';
import { LaunchTable } from './launch-table';

/**
 * Wave-5 acceptance: badge coverage for every deck-local review status and
 * the launch-table contract (detail links, verification coverage column).
 */

afterEach(cleanup);

describe('launch badges', () => {
  it('renders a humanized badge for every launch review status', () => {
    for (const status of LAUNCH_REVIEW_STATUSES) {
      render(<LaunchStatusBadge status={status} />);
      expect(screen.getByText(humanize(status))).toBeInTheDocument();
      cleanup();
    }
  });

  it('labels bond paid and unpaid distinctly', () => {
    render(<BondPaidBadge paid />);
    render(<BondPaidBadge paid={false} />);
    expect(screen.getByText('bond paid')).toBeInTheDocument();
    expect(screen.getByText('bond unpaid')).toBeInTheDocument();
  });

  it('humanizes verification claim kinds', () => {
    render(<VerificationClaimBadge claim="admin_key_free" />);
    expect(screen.getByText('admin key free')).toBeInTheDocument();
  });
});

describe('LaunchTable', () => {
  it('links every request id to its detail page and shows its status', () => {
    render(<LaunchTable requests={MOCK_LAUNCH_REQUESTS} />);
    for (const request of MOCK_LAUNCH_REQUESTS) {
      const link = screen.getByRole('link', { name: request.id });
      expect(link).toHaveAttribute('href', `/launch/${request.id}`);
      expect(
        screen.getAllByText(humanize(request.status)).length,
      ).toBeGreaterThan(0);
    }
  });

  it('shows verification coverage — claim count or missing', () => {
    render(<LaunchTable requests={MOCK_LAUNCH_REQUESTS} />);
    const withVerification = MOCK_LAUNCH_REQUESTS.filter(
      (request) => request.context.verification !== undefined,
    );
    for (const request of withVerification) {
      const claims = request.context.verification?.claims.length ?? 0;
      expect(screen.getAllByText(`${claims} claims`).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText('missing').length).toBeGreaterThan(0);
  });
});
