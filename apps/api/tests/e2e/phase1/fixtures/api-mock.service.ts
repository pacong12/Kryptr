/**
 * API Mock Service Layer
 * Provides realistic HTTP responses for E2E testing
 * Mimics NestJS controller behavior without actual network calls
 */

import type { Response } from 'supertest';
import {
  MOCK_API_RESPONSES,
  SCENARIO_DATA,
  NETWORK_FAILURE_PATTERNS,
} from './mock-data';

export interface MockHttpOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: any;
  headers?: Record<string, string>;
  delayMs?: number;
  simulateError?: boolean;
  errorPattern?: keyof typeof NETWORK_FAILURE_PATTERNS;
}

interface MockResponse {
  status: number;
  headers: Record<string, string>;
  body: any;
}

export class ApiMockService {
  private requestHistory: Array<{
    method: string;
    path: string;
    timestamp: Date;
  }> = [];

  /**
   * Simulate GET /api/wallets/:id/balances
   */
  async getWalletBalances(walletId: string): Promise<MockResponse> {
    this.logRequest('GET', `/api/wallets/${walletId}/balances`);

    // Validate wallet exists
    if (!walletId.startsWith('wallet-phase1-test-')) {
      return {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Wallet not found', code: 'wallet_not_found' },
      };
    }

    // Return realistic balance data
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        walletId,
        balances: [
          {
            walletId,
            chain: 'ethereum',
            nativeBalance: '5000000000000000000',
            tokens: [
              {
                address: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
                symbol: 'USDC',
                decimals: 6,
                balance: '10000000000',
              },
            ],
          },
        ],
      },
    };
  }

  /**
   * Simulate POST /api/security/intents
   */
  async submitIntent(intentData: any): Promise<MockResponse> {
    this.logRequest('POST', '/api/security/intents');

    // Validate intent structure
    if (!intentData.kind || !intentData.walletId) {
      return {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Invalid intent structure', code: 'validation_error' },
      };
    }

    // Check for automation deploy rejection
    if (
      intentData.kind === 'deploy' &&
      intentData.origin?.startsWith('automation:')
    ) {
      return {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: {
          id: 'intent-automated-rejected',
          status: 'rejected',
          reason: 'automation_deploy_forbidden',
          createdAt: new Date().toISOString(),
        },
      };
    }

    // Process transfer intents based on amount
    if (intentData.kind === 'transfer') {
      const amountMicros = parseInt(intentData.transfer?.amount, 10) || 0;
      const valueUsd = amountMicros / 1_000_000; // Simplified conversion

      // Approve small transfers (< $100)
      if (valueUsd <= 100) {
        return {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
          body: {
            id: `intent-${Date.now()}`,
            status: 'approved',
            decision: 'approved',
            reason: 'approved: within policy',
            valueUsd: parseFloat(valueUsd.toFixed(2)),
            reservedSpendUsd: parseFloat(valueUsd.toFixed(2)),
            createdAt: new Date().toISOString(),
          },
        };
      }

      // Require approval for medium transfers ($100 - $1000)
      if (valueUsd <= 1000) {
        return {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
          body: {
            id: `intent-${Date.now()}`,
            status: 'needs_human_approval',
            decision: 'needs_human_approval',
            reason: `needs_human_approval: value $${valueUsd.toFixed(2)} exceeds approval threshold $100.00`,
            valueUsd: parseFloat(valueUsd.toFixed(2)),
            requiredHumanApproval: true,
            createdAt: new Date().toISOString(),
          },
        };
      }

      // Reject large transfers exceeding daily cap
      return {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: {
          id: `intent-${Date.now()}`,
          status: 'rejected',
          decision: 'rejected',
          reason: `rejected: daily cap exceeded (value $${valueUsd.toFixed(2)} does not fit under cap $1000.00)`,
          valueUsd: parseFloat(valueUsd.toFixed(2)),
          createdAt: new Date().toISOString(),
        },
      };
    }

    // Default response for unknown intent types
    return {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      body: {
        id: `intent-${Date.now()}`,
        status: 'submitted',
        kind: intentData.kind,
        createdAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Simulate GET /api/security/intents/:id
   */
  async getIntentStatus(intentId: string): Promise<MockResponse> {
    this.logRequest('GET', `/api/security/intents/${intentId}`);

    if (!intentId.startsWith('intent-')) {
      return {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Intent not found', code: 'intent_not_found' },
      };
    }

    // Return current status of intent
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        id: intentId,
        status: 'approved',
        walletId: 'wallet-phase1-test-001',
        kind: 'transfer',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
    };
  }

  /**
   * Simulate GET /api/security/intents/:id/timeline
   */
  async getTimeline(intentId: string): Promise<MockResponse> {
    this.logRequest('GET', `/api/security/intents/${intentId}/timeline`);

    if (!intentId.startsWith('intent-')) {
      return {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Intent not found', code: 'intent_not_found' },
      };
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        intentId,
        steps: [
          {
            step: 'created',
            at: new Date(Date.now() - 3600000).toISOString(),
            actor: 'user',
            detail: 'transfer intent received',
          },
          {
            step: 'gate_decision',
            at: new Date(Date.now() - 3540000).toISOString(),
            actor: 'gate',
            detail: 'approved: within policy',
          },
        ],
      },
    };
  }

  /**
   * Simulate GET /api/health/feeds
   */
  async getSecurityFeeds(): Promise<MockResponse> {
    this.logRequest('GET', '/api/health/feeds');

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        feeds: [
          {
            feedId: 'dex:zero-ex',
            source: '0x',
            status: 'healthy',
            lastUpdateAt: new Date().toISOString(),
            priceAgeSec: 120,
          },
          {
            feedId: 'price:coingecko',
            source: 'coingecko',
            status: 'healthy',
            lastUpdateAt: new Date().toISOString(),
            priceAgeSec: 60,
          },
        ],
      },
    };
  }

  /**
   * Simulate database failures for fail-closed testing
   */
  async simulateDatabaseFailure(): Promise<MockResponse> {
    this.logRequest('POST', '/api/security/intents', 'FAILURE_SIMULATION');

    throw {
      status: 500,
      message: 'Database connection failed',
      code: 'database_error',
    };
  }

  /**
   * Simulate network timeouts
   */
  async simulateNetworkTimeout(): Promise<never> {
    await new Promise(() => {}); // Never resolves
    throw new Error('Request timeout');
  }

  /**
   * Simulate partial failures
   */
  async simulatePartialFailure(intentId: string): Promise<MockResponse> {
    this.logRequest('GET', `/api/security/intents/${intentId}`);

    // Simulate intermittent success/failure
    const shouldFail = Math.random() < 0.3;

    if (shouldFail) {
      throw {
        status: 503,
        message: 'Service temporarily unavailable',
        code: 'service_unavailable',
      };
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { id: intentId, status: 'approved' },
    };
  }

  /**
   * Get request history for validation
   */
  getRequestHistory(): Array<{
    method: string;
    path: string;
    timestamp: Date;
  }> {
    return [...this.requestHistory];
  }

  /**
   * Clear request history
   */
  clearRequestHistory(): void {
    this.requestHistory = [];
  }

  /**
   * Log API request for audit trail
   */
  private logRequest(method: string, path: string): void {
    this.requestHistory.push({
      method,
      path,
      timestamp: new Date(),
    });
  }
}

/**
 * Export singleton instance for easier usage
 */
export const apiMock = new ApiMockService();
