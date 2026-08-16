import { Suspense } from 'react';

import {
  ChainConnectionsSection,
  ChainConnectionsSectionSkeleton,
} from '@/components/chains-section';
import {
  DashboardAutoRefresh,
  RefreshButton,
} from '@/components/dashboard-refresh';
import { FeedsSection, FeedsSectionSkeleton } from '@/components/feeds-section';
import {
  HealthSection,
  HealthSectionSkeleton,
} from '@/components/health-section';
import {
  RecentIntentsSection,
  RecentIntentsSectionSkeleton,
} from '@/components/recent-intents-section';
import {
  WalletsSection,
  WalletsSectionSkeleton,
} from '@/components/wallets-section';
import {
  WorkerHealthSection,
  WorkerHealthSectionSkeleton,
} from '@/components/worker-health-section';

/**
 * Dashboard. Each section is its own async server component inside a
 * Suspense boundary, so /health, feeds, chains, /wallets and the intents
 * feed are fetched in parallel and stream in independently (no request
 * waterfall). Wave 3 adds a 12s auto-refresh (router.refresh) plus a manual
 * Refresh button — decision panels on other routes stay untouched.
 */
export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <DashboardAutoRefresh />
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Fleet health, data feeds, chain connections, the order worker, agent
            wallets and the latest transaction intents.
          </p>
        </div>
        <RefreshButton />
      </header>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<HealthSectionSkeleton />}>
          <HealthSection />
        </Suspense>
        <Suspense fallback={<FeedsSectionSkeleton />}>
          <FeedsSection />
        </Suspense>
        <Suspense fallback={<ChainConnectionsSectionSkeleton />}>
          <ChainConnectionsSection />
        </Suspense>
        <Suspense fallback={<WorkerHealthSectionSkeleton />}>
          <WorkerHealthSection />
        </Suspense>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Suspense fallback={<WalletsSectionSkeleton />}>
          <WalletsSection />
        </Suspense>
        <Suspense fallback={<RecentIntentsSectionSkeleton />}>
          <RecentIntentsSection />
        </Suspense>
      </div>
    </div>
  );
}
