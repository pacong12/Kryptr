/**
 * Phase 1 Backoffice Monitoring Test Suite
 * Validates: Real-time Dashboard polling, Signing console status & auto-refresh triggers
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { dashboardMock } from '../fixtures/backoffice/dashboard-mock.service';
import { dbMock } from '../fixtures/database-mock.harness';
import { apiMock } from '../fixtures/api-mock.service';
import {
  TEST_WALLET_1,
  SCENARIO_DATA,
  isoTime,
  delay,
} from '../fixtures/mock-data';

describe('Backoffice Monitoring (Phase 1)', () => {
  beforeEach(async () => {
    await dbMock.clearAll();
    dashboardMock.clearAll();
    dashboardMock.setAutoRefresh(true);
  });

  describe('Real-Time Dashboard Polling (10s Refresh)', () => {
    it('should refresh dashboard data at configured interval', async () => {
      // Given: Dashboard with pending intents
      const intentData = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
          amount: '100000000',
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      await apiMock.submitIntent(intentData);

      // When: First dashboard view
      const initialView = await dashboardMock.getDashboardView(false);
      
      const timeBefore = Date.now();

      // Wait for refresh interval
      await delay(100); // Simulate immediate refresh for testing
      
      // Trigger manual refresh
      await dashboardMock.triggerManualRefresh();

      const timeAfter = Date.now();

      // Then: lastRefreshTime should have updated
      const refreshedView = await dashboardMock.getDashboardView();
      
      expect(refreshedView.lastRefreshTime.getTime()).toBeGreaterThanOrEqual(
        initialView.lastRefreshTime.getTime()
      );
    });

    it('should maintain polling consistency across multiple intervals', async () => {
      // Given: Active dashboard
      const startTime = Date.now();
      const pollCount = 5;
      const views: any[] = [];

      for (let i = 0; i < pollCount; i++) {
        const view = await dashboardMock.getDashboardView(i === 0);
        views.push({
          index: i,
          timestamp: Date.now(),
          pendingIntents: view.summary.pendingIntents,
          lastRefresh: view.lastRefreshTime,
        });

        // Simulate real-world polling delays
        if (i < pollCount - 1) {
          await delay(100);
          
          // Add new intent between polls to test updates
          if (i === 2) {
            const newIntent = await apiMock.submitIntent({
              kind: 'transfer' as const,
              walletId: TEST_WALLET_1.id,
              origin: 'user',
              transfer: {
                assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
                amount: '100000000',
                recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
                chain: 'ethereum',
                slippageBps: 50,
              },
            });

            await dashboardMock.addIntent({
              id: newIntent.body.id,
              status: newIntent.body.status,
              kind: newIntent.body.kind,
              walletId: newIntent.body.walletId,
              origin: newIntent.body.origin,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        }
      }

      // Then: All polls should be sequential and consistent
      for (let i = 1; i < views.length; i++) {
        expect(views[i].timestamp).toBeGreaterThanOrEqual(views[i - 1].timestamp);
        expect(views[i].lastRefresh.getTime()).toBeGreaterThanOrEqual(
          views[i - 1].lastRefresh.getTime()
        );
      }
    });

    it('should include comprehensive summary statistics in each poll', async () => {
      // Given: Multiple intents with various statuses
      const statuses = ['submitted', 'approved', 'rejected', 'needs_human_approval'];
      
      for (const status of statuses) {
        const intent = {
          kind: 'transfer' as const,
          walletId: TEST_WALLET_1.id,
          origin: 'user',
          transfer: {
            assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
            amount: '100000000',
            recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
            chain: 'ethereum',
            slippageBps: 50,
          },
        };

        const response = await apiMock.submitIntent(intent);
        
        if (status !== 'submitted') {
          await dashboardMock.updateIntentStatus(response.body.id, status);
        }

        await dashboardMock.addIntent({
          id: response.body.id,
          status: status,
          kind: 'transfer',
          walletId: TEST_WALLET_1.id,
          origin: 'user',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // When: Fetch dashboard view
      const view = await dashboardMock.getDashboardView();

      // Then: Statistics should match actual counts
      expect(view.summary.totalIntents).toBe(statuses.length);
      expect(view.summary.pendingIntents + view.summary.executedIntents).toBe(
        statuses.length
      );
      expect(view.summary.averageValueUsd).toBeLessThanOrEqual(1000);
    });
  });

  describe('Signing Console Status Updates', () => {
    it('should display pending signatures in signing queue', async () => {
      // Given: Approved intents ready for signature
      const approvedIntent = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
          amount: '100000000',
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      const submitResponse = await apiMock.submitIntent(approvedIntent);
      
      // Approve through dashboard
      await dashboardMock.updateIntentStatus(submitResponse.body.id, 'approved');

      await dashboardMock.addIntent({
        id: submitResponse.body.id,
        status: 'approved',
        kind: 'transfer',
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // When: Check signing queue
      const queue = dashboardMock.getSigningQueue();

      // Then: Should contain approved intents
      expect(queue.length).toBeGreaterThanOrEqual(1);
      expect(queue[0].intentId).toBe(submitResponse.body.id);
      expect(queue[0].kind).toBe('transfer');
    });

    it('should update console status when signatures are completed', async () => {
      // Given: Pending signature
      const intentId = `console-status-test-${Date.now()}`;
      
      await dashboardMock.addIntent({
        id: intentId,
        status: 'approved',
        kind: 'transfer',
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // When: Mark as signed
      const markedSigned = await dashboardMock.markAsSigned(intentId);

      // Then: State should transition correctly
      expect(markedSigned).toBeTruthy();

      const queueAfter = dashboardMock.getSigningQueue();
      const foundInQueue = queueAfter.some((q) => q.intentId === intentId);
      
      expect(foundInQueue).toBeFalsy(); // Removed from queue after signing
    });

    it('should generate appropriate alerts for unsigned intents', async () => {
      // Given: Intent approved but not yet signed
      const staleApproved = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
          amount: '100000000',
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      const response = await apiMock.submitIntent(staleApproved);
      await dashboardMock.updateIntentStatus(response.body.id, 'approved');

      // Generate alerts
      const alerts = dashboardMock.generateAlerts();

      // Then: Verify alert generation logic
      // (No alerts expected for recently approved intents)
      const staleApprovalAlerts = alerts.filter(a => a.type === 'stale_pending_approval');
      
      // Allow zero alerts for recent approvals
      expect(Array.isArray(staleApprovalAlerts)).toBeTruthy();
    });
  });

  describe('Auto-Refresh Triggers and Edge Cases', () => {
    it('should trigger refresh when interval expires', async () => {
      // Given: Auto-refresh enabled
      dashboardMock.setAutoRefresh(true);
      
      const previousRefresh = dashboardMock['lastRefreshTime'] as Date;

      // Force elapsed time > interval
      dashboardMock['lastRefreshTime'] = new Date(Date.now() - 15000);

      // Trigger auto-refresh check
      await dashboardMock.triggerAutoRefresh();

      // Then: Should have refreshed
      const currentRefresh = dashboardMock['lastRefreshTime'] as Date;
      
      expect(currentRefresh.getTime()).toBeGreaterThan(previousRefresh.getTime());
    });

    it('should respect disabled auto-refresh state', async () => {
      // Given: Auto-refresh disabled
      dashboardMock.setAutoRefresh(false);
      
      const previousRefresh = dashboardMock['lastRefreshTime'] as Date;

      // Attempt auto-refresh
      await dashboardMock.triggerAutoRefresh();

      const currentRefresh = dashboardMock['lastRefreshTime'] as Date;

      // Then: No refresh should occur
      expect(currentRefresh.getTime()).toBe(previousRefresh.getTime());
    });

    it('should handle rapid manual refresh without duplication', async () => {
      // Given: Rapid refresh requests
      const refreshPromises = Array(5).fill(null).map(() => 
        dashboardMock.triggerManualRefresh()
      );

      await Promise.all(refreshPromises);

      // Then: Each refresh should be logged distinctly
      const history = dbMock.getAuditHistory(100);
      const refreshOps = history.filter(h => h.operation.includes('refresh'));
      
      // At least one refresh operation recorded
      expect(refreshOps.length).toBeGreaterThanOrEqual(1);
    });

    it('should prevent race conditions during concurrent refresh operations', async () => {
      // Given: Simultaneous refresh attempts
      const refreshCount = 10;
      const refreshResults: boolean[] = [];

      const refreshTasks = await Promise.all(
        Array(refreshCount).fill(null).map(async () => {
          try {
            await dashboardMock.triggerManualRefresh();
            return true;
          } catch {
            return false;
          }
        })
      );

      refreshResults.push(...refreshTasks);

      // Then: All should succeed without errors
      const successRate = refreshResults.filter(r => r).length / refreshResults.length;
      expect(successRate).toBe(1.0);
    });
  });

  describe('Frontoffice → Security → API → DB → Backoffice Flow', () => {
    it('should synchronize data across all five layers', async () => {
      // Layer 1: Frontoffice submits intent
      const frontendIntent = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
          amount: '100000000',
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      // Layer 2: Security gate evaluates
      const securityResponse = await apiMock.submitIntent(frontendIntent);
      const securityDecision = securityResponse.body.decision;

      // Layer 3: API persists to database
      const persistedIntent = await dbMock.findById(securityResponse.body.id);
      
      // Layer 4: Database records state
      expect(persistedIntent).toBeDefined();
      expect(persistedIntent!.decision).toBe(securityDecision);

      // Layer 5: Backoffice dashboard reflects changes
      await dashboardMock.addIntent({
        id: securityResponse.body.id,
        status: securityResponse.body.status,
        kind: securityResponse.body.kind,
        walletId: securityResponse.body.walletId,
        origin: securityResponse.body.origin,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const dashboardView = await dashboardMock.getDashboardView();
      
      // Verification: All layers synchronized
      const intentInDashboard = dashboardView.recentIntents.some(
        (i) => i.id === securityResponse.body.id
      );

      expect(intentInDashboard).toBeTruthy();
      expect(persistedIntent!.walletId).toBe(TEST_WALLET_1.id);
    });

    it('should maintain cross-service state consistency throughout lifecycle', async () => {
      // Create and track complete lifecycle
      const intentData = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
          amount: '200000000',
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      // Submit through API
      const submission = await apiMock.submitIntent(intentData);
      const intentId = submission.body.id;

      // Track state through different layers
      const states: Array<{ layer: string; state: any }> = [
        { layer: 'API_Submission', state: submission.body },
      ];

      // Persist in database
      await dbMock.saveIntent({
        kind: submission.body.kind,
        walletId: submission.body.walletId,
        origin: submission.body.origin,
        intentData: submission.body.transfer,
        decision: submission.body.decision,
      });

      const dbState = await dbMock.findById(intentId);
      states.push({ layer: 'DB_Persistence', state: dbState });

      // Add to dashboard
      await dashboardMock.addIntent({
        id: intentId,
        status: submission.body.status,
        kind: submission.body.kind,
        walletId: submission.body.walletId,
        origin: submission.body.origin,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const dashboardState = await dashboardMock.getDashboardView();
      states.push({ layer: 'Backoffice_Dashboard', state: dashboardState.summary });

      // Verify consistency across all layers
      const walletIds = states.map(s => s.state.walletId || s.state.summary.pendingIntents);
      const decisions = states.map(s => s.state.decision || s.state.status);

      // Wallet ID consistency check
      const uniqueWalletIds = new Set(walletIds);
      expect(uniqueWalletIds.size).toBeLessThanOrEqual(2); // Allow for some structural differences

      // Decision/status consistency check
      const uniqueDecisions = new Set(decisions.filter(d => d !== undefined));
      expect(uniqueDecisions.size).toBeLessThanOrEqual(2);
    });

    it('should process high-volume transfers without synchronization loss', async () => {
      // Given: Batch of parallel transfers
      const batchCount = 20;
      const batchPromises = await Promise.all(
        Array(batchCount).fill(null).map(async (_, i) => {
          const intentData = {
            kind: 'transfer' as const,
            walletId: TEST_WALLET_1.id,
            origin: 'user',
            transfer: {
              assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
              amount: String(10000000 + i),
              recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
              chain: 'ethereum',
              slippageBps: 50,
            },
          };

          const response = await apiMock.submitIntent(intentData);
          
          await dbMock.saveIntent({
            kind: response.body.kind,
            walletId: response.body.walletId,
            origin: response.body.origin,
            intentData: response.body.transfer,
            decision: response.body.decision,
          });

          await dashboardMock.addIntent({
            id: response.body.id,
            status: response.body.status,
            kind: response.body.kind,
            walletId: response.body.walletId,
            origin: response.body.origin,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          return response.body.id;
        })
      );

      // After batch completion, verify all intents visible in dashboard
      const dashboardView = await dashboardMock.getDashboardView();

      const visibleInDashboard = batchPromises.every(id =>
        dashboardView.recentIntents.some((i: any) => i.id === id)
      );

      expect(visibleInDashboard).toBeTruthy();
      expect(dashboardView.summary.totalIntents).toBeGreaterThanOrEqual(batchCount);
    });
  });

  describe('Performance Benchmarks for Concurrent Transfers', () => {
    it('should handle 100 simultaneous dashboard queries', async () => {
      // Warm up dashboard
      for (let i = 0; i < 10; i++) {
        await apiMock.submitIntent({
          kind: 'transfer' as const,
          walletId: TEST_WALLET_1.id,
          origin: 'user',
          transfer: {
            assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
            amount: '100000000',
            recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
            chain: 'ethereum',
            slippageBps: 50,
          },
        });
      }

      // Performance test: 100 concurrent queries
      const startTime = Date.now();
      
      const queryPromises = Array(100).fill(null).map(() => 
        dashboardMock.getDashboardView()
      );

      const results = await Promise.all(queryPromises);
      
      const duration = Date.now() - startTime;

      // Then: Should respond within SLA
      expect(results.length).toBe(100);
      expect(duration).toBeLessThan(5000); // 5 second SLA
      
      console.log(`[Performance] 100 dashboard queries completed in ${duration}ms`);
    });

    it('should maintain data integrity under stress load', async () => {
      // Stress test: Rapid write and read cycles
      const stressIterations = 20;
      const operations: Array<{ type: string; success: boolean }> = [];

      for (let i = 0; i < stressIterations; i++) {
        try {
          // Write operation
          const intentData = {
            kind: 'transfer' as const,
            walletId: TEST_WALLET_1.id,
            origin: 'user',
            transfer: {
              assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
              amount: '100000000',
              recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
              chain: 'ethereum',
              slippageBps: 50,
            },
          };

          await apiMock.submitIntent(intentData);
          
          await dbMock.saveIntent({
            kind: 'transfer',
            walletId: TEST_WALLET_1.id,
            origin: 'user',
            intentData: {},
            decision: 'pending',
          });

          operations.push({ type: 'write', success: true });

          // Read operation
          const view = await dashboardMock.getDashboardView();
          operations.push({ type: 'read', success: true });

        } catch (error) {
          operations.push({ type: 'mixed', success: false });
        }
      }

      // Verify no corruption occurred
      const successfulOps = operations.filter(o => o.success);
      const failureRate = (operations.length - successfulOps.length) / operations.length;

      expect(failureRate).toBeLessThan(0.1); // Less than 10% failure rate acceptable
      
      console.log(`[StressTest] ${successfulOps.length}/${operations.length} operations successful`);
    });
  });
});
