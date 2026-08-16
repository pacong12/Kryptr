import { Suspense } from 'react';

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

/**
 * Dashboard. Each section is its own async server component inside a
 * Suspense boundary, so /health, /wallets and the intents feed are fetched
 * in parallel and stream in independently (no request waterfall).
 */
export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Fleet health, agent wallets and the latest transaction intents.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Suspense fallback={<HealthSectionSkeleton />}>
          <HealthSection />
        </Suspense>
        <Suspense fallback={<FeedsSectionSkeleton />}>
          <FeedsSection />
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
