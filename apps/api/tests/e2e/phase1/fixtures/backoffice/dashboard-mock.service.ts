/**
 * Backoffice Dashboard Mock Service
 * Simulates Deck backoffice dashboard behavior for E2E testing
 */

import type { TransactionIntent, SecurityDecision } from '@kryptr/shared-types';

interface DashboardIntent {
  id: string;
  status: 'submitted' | 'approved' | 'rejected' | 'needs_human_approval' | 'executed' | 'failed';
  kind: string;
  walletId: string;
  origin: string;
  valueUsd?: number;
  createdAt: Date;
  updatedAt: Date;
}

interface SigningConsoleEvent {
  eventType: 'pending_signature' | 'signature_complete' | 'signing_error';
  intentId: string;
  timestamp: Date;
  details?: any;
}

export class DashboardMockService {
  private pendingIntents: Map<string, DashboardIntent> = new Map();
  private executedIntents: Map<string, DashboardIntent> = new Map();
  private signingConsoleEvents: SigningConsoleEvent[] = [];
  private lastRefreshTime: Date = new Date();
  private refreshIntervalMs: number = 10000; // 10s as per spec
  private autoRefreshEnabled: boolean = true;
  private subscribers: Set<(data: DashboardData) => void> = new Set();

  constructor() {
    this.log('dashboard_service_initialized', {});
  }

  /**
   * Add intent to dashboard monitoring
   */
  async addIntent(intent: DashboardIntent): Promise<void> {
    if (intent.status === 'executed' || intent.status === 'failed') {
      this.executedIntents.set(intent.id, intent);
    } else {
      this.pendingIntents.set(intent.id, intent);
    }

    this.log('intent_added_to_dashboard', {
      intentId: intent.id,
      status: intent.status,
    });

    this.notifySubscribers();
  }

  /**
   * Update intent status in dashboard
   */
  async updateIntentStatus(
    intentId: string,
    newStatus: DashboardIntent['status'],
    decisionData?: Partial<SecurityDecision>
  ): Promise<boolean> {
    const pending = this.pendingIntents.get(intentId);
    const executed = this.executedIntents.get(intentId);
    const target = pending || executed;

    if (!target) {
      this.log('intent_not_found_for_status_update', { intentId });
      return false;
    }

    target.status = newStatus;
    target.updatedAt = new Date();

    if (pending) {
      this.pendingIntents.delete(intentId);
      if (newStatus === 'executed' || newStatus === 'failed') {
        this.executedIntents.set(intentId, target);
      }
    }

    this.log('intent_status_updated', {
      intentId,
      oldStatus: pending ? pending.status : executed!.status,
      newStatus,
    });

    // Generate signing console event if applicable
    if (newStatus === 'approved') {
      this.signingConsoleEvents.push({
        eventType: 'pending_signature',
        intentId,
        timestamp: new Date(),
        details: decisionData,
      });
    }

    this.notifySubscribers();
    return true;
  }

  /**
   * Get dashboard view data
   */
  async getDashboardView(refresh?: boolean): Promise<DashboardData> {
    if (refresh) {
      await this.triggerAutoRefresh();
    }

    const summary = {
      totalIntents: this.pendingIntents.size + this.executedIntents.size,
      pendingIntents: this.pendingIntents.size,
      executedIntents: this.executedIntents.size,
      failedIntents: Array.from(this.executedIntents.values()).filter(
        (i) => i.status === 'failed'
      ).length,
      approvedIntents: Array.from(this.executedIntents.values()).filter(
        (i) => i.status === 'executed'
      ).length,
      averageValueUsd: this.calculateAverageValue(),
    };

    const recentIntents = this.getRecentIntents(10);
    const signingQueue = this.getSigningQueue();
    const alerts = this.generateAlerts();

    return {
      summary,
      recentIntents,
      signingQueue,
      alerts,
      lastRefreshTime: this.lastRefreshTime,
      refreshIntervalMs: this.refreshIntervalMs,
      autoRefreshEnabled: this.autoRefreshEnabled,
    };
  }

  /**
   * Trigger manual refresh
   */
  async triggerManualRefresh(): Promise<void> {
    this.lastRefreshTime = new Date();
    this.log('manual_refresh_triggered', {});
    this.notifySubscribers();
  }

  /**
   * Enable/disable auto-refresh
   */
  setAutoRefresh(enabled: boolean): void {
    this.autoRefreshEnabled = enabled;
    this.log('auto_refresh_toggled', { enabled });
  }

  /**
   * Simulate background refresh polling
   */
  async triggerAutoRefresh(): Promise<void> {
    if (!this.autoRefreshEnabled) {
      return;
    }

    const now = new Date();
    const timeSinceLastRefresh = now.getTime() - this.lastRefreshTime.getTime();

    if (timeSinceLastRefresh >= this.refreshIntervalMs) {
      this.lastRefreshTime = now;
      this.log('auto_refresh_executed', {
        interval: this.refreshIntervalMs,
      });
      this.notifySubscribers();
    }
  }

  /**
   * Mark intent as signed (completed in signing console)
   */
  async markAsSigned(intentId: string): Promise<boolean> {
    const intent = this.pendingIntents.get(intentId) || this.executedIntents.get(intentId);

    if (!intent) {
      return false;
    }

    intent.status = 'executed';
    intent.updatedAt = new Date();

    this.pendingIntents.delete(intentId);
    this.executedIntents.set(intentId, intent);

    this.signingConsoleEvents.push({
      eventType: 'signature_complete',
      intentId,
      timestamp: new Date(),
    });

    this.log('intent_marked_signed', { intentId });
    this.notifySubscribers();

    return true;
  }

  /**
   * Generate alert notifications
   */
  generateAlerts(): Alert[] {
    const alerts: Alert[] = [];

    // Check for intents pending approval too long
    const staleApproved = Array.from(this.pendingIntents.values()).filter((i) =>
      i.status === 'needs_human_approval'
    );

    for (const intent of staleApproved) {
      const ageHours = (Date.now() - intent.createdAt.getTime()) / (1000 * 60 * 60);
      if (ageHours > 2) {
        alerts.push({
          type: 'stale_pending_approval',
          message: `Intent ${intent.id} pending human approval for ${ageHours.toFixed(1)} hours`,
          severity: 'warning',
          intentId: intent.id,
        });
      }
    }

    // Check for high-value intents needing approval
    const highValuePending = Array.from(this.pendingIntents.values()).filter(
      (i) => i.valueUsd && i.valueUsd > 5000 && i.status === 'needs_human_approval'
    );

    for (const intent of highValuePending) {
      alerts.push({
        type: 'high_value_pending',
        message: `High-value intent ($${intent.valueUsd}) requires immediate attention`,
        severity: 'critical',
        intentId: intent.id,
      });
    }

    // Check for recent failures
    const recentFailures = Array.from(this.executedIntents.values()).filter(
      (i) => i.status === 'failed' && Date.now() - i.updatedAt.getTime() < 3600000
    );

    for (const intent of recentFailures) {
      alerts.push({
        type: 'recent_failure',
        message: `Intent ${intent.id} recently failed execution`,
        severity: 'error',
        intentId: intent.id,
      });
    }

    return alerts;
  }

  /**
   * Get recent intents from dashboard
   */
  getRecentIntents(limit: number = 10): DashboardIntent[] {
    const all = [
      ...Array.from(this.pendingIntents.values()),
      ...Array.from(this.executedIntents.values()),
    ];

    return all
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get signing queue (intents ready for signature)
   */
  getSigningQueue(): SigningQueueItem[] {
    const pendingApprovals = Array.from(this.pendingIntents.values()).filter(
      (i) => i.status === 'approved'
    );

    return pendingApprovals.map((intent) => ({
      intentId: intent.id,
      kind: intent.kind,
      createdAt: intent.createdAt,
      valueUsd: intent.valueUsd,
    }));
  }

  /**
   * Calculate average transaction value
   */
  calculateAverageValue(): number {
    const all = [...Array.from(this.pendingIntents.values()), ...Array.from(this.executedIntents.values())];
    const withValues = all.filter((i) => i.valueUsd !== undefined && i.valueUsd! > 0);
    
    if (withValues.length === 0) return 0;
    
    const sum = withValues.reduce((acc, i) => acc + (i.valueUsd || 0), 0);
    return sum / withValues.length;
  }

  /**
   * Subscribe to dashboard updates
   */
  subscribe(callback: (data: DashboardData) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Clear all dashboard data
   */
  async clearAll(): Promise<void> {
    this.pendingIntents.clear();
    this.executedIntents.clear();
    this.signingConsoleEvents.length = 0;
    this.lastRefreshTime = new Date();
    this.log('dashboard_cleared', {});
  }

  /**
   * Log dashboard events for audit trail
   */
  private log(event: string, details: any): void {
    console.log(`[DashboardMock] ${event}`, details);
  }

  /**
   * Notify subscribers of dashboard changes
   */
  private notifySubscribers(): void {
    const subscribersArray = Array.from(this.subscribers);
    subscribersArray.forEach((callback) => {
      try {
        callback({});
      } catch (error) {
        console.error('[DashboardMock] Subscriber error:', error);
      }
    });
  }
}

/**
 * Dashboard data structure
 */
export interface DashboardData {
  summary: {
    totalIntents: number;
    pendingIntents: number;
    executedIntents: number;
    failedIntents: number;
    approvedIntents: number;
    averageValueUsd: number;
  };
  recentIntents: DashboardIntent[];
  signingQueue: SigningQueueItem[];
  alerts: Alert[];
  lastRefreshTime: Date;
  refreshIntervalMs: number;
  autoRefreshEnabled: boolean;
}

/**
 * Alert notification types
 */
export interface Alert {
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  intentId?: string;
}

/**
 * Signing queue item
 */
export interface SigningQueueItem {
  intentId: string;
  kind: string;
  createdAt: Date;
  valueUsd?: number;
}

/**
 * Export singleton instance
 */
export const dashboardMock = new DashboardMockService();
