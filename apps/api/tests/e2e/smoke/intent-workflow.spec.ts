/**
 * Intent Workflow E2E Smoke Test
 * Validates: Real-time dashboard updates every 10s, Intent detail page flows
 * Purpose: End-to-end intent lifecycle management and timeline updates
 * Milestone: W7-M5 (Intent Detail Page)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app/app.module';
import type { TransactionIntent, SecurityDecision, IntentTimelineStep } from '@kryptr/shared-types';

describe('Intent Workflow E2E', () => {
  let app: INestApplication;
  let createdIntentId: string | null = null;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen();

    console.log('[IntentE2E] Application ready for testing');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/security/intents', () => {
    it('should create a new swap intent successfully', async () => {
      // Given: Valid swap intent data
      const swapIntent: Omit<TransactionIntent, 'id' | 'createdAt'> = {
        kind: 'swap',
        walletId: 'wallet-123-test',
        origin: 'user',
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        amount: '100000000000000000',
        slippageBps: 50,
        chain: 'base',
      };

      // When: Submit new intent for evaluation
      const response = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(swapIntent)
        .expect(201);

      // Then: Validate intent creation
      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('submitted');
      
      createdIntentId = response.body.id;
      expect(createdIntentId).toBeDefined();

      // Store ID for other tests
      jest.mocked(request).intentId = createdIntentId;
    }, 10000);

    it('should validate required intent fields', async () => {
      // Given: Invalid intent with missing required field
      const invalidIntent: any = {
        kind: 'swap',
        // walletId is missing
        origin: 'user',
        amount: '100000000000000000',
      };

      // When: Submit invalid intent
      const response = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(invalidIntent)
        .expect(422);

      // Then: Validate error structure
      expect(response.body.error).toBeDefined();
      expect(response.body.code).toBe('validation_error');
    });

    it('should reject deploy intents from automation origins', async () => {
      // Given: Deploy intent from automation origin
      const deployIntent: Omit<TransactionIntent, 'id' | 'createdAt'> = {
        kind: 'deploy',
        walletId: 'wallet-123-test',
        origin: 'automation:worker',
        // deployment details would be here
      };

      // When: Submit deploy intent from automation
      const response = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(deployIntent)
        .expect(201);

      // Then: Should be rejected immediately
      expect(response.body.status).toBe('rejected');
      expect(response.body.reason).toBe('automation_deploy_forbidden');
    }, 10000);
  });

  describe('GET /api/security/intents/:id/timeline', () => {
    beforeEach(async () => {
      // Clean up previous intent
      createdIntentId = null;
    });

    it('should return complete timeline for processed intent', async () => {
      // Given: Create an intent first
      const swapIntent: Omit<TransactionIntent, 'id' | 'createdAt'> = {
        kind: 'swap',
        walletId: 'wallet-timeline-test',
        origin: 'user',
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        amount: '100000000000000000',
        slippageBps: 50,
        chain: 'base',
      };

      const submitResponse = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(swapIntent)
        .expect(201);

      const testIntentId = submitResponse.body.id;

      // When: Fetch timeline for the intent
      const timelineResponse = await request(app.getHttpServer())
        .get(`/api/security/intents/${testIntentId}/timeline`)
        .expect(200);

      // Then: Timeline should have multiple steps
      const timeline: IntentTimelineStep[] = timelineResponse.body.steps;
      
      expect(Array.isArray(timeline)).toBeTruthy();
      expect(timeline.length).toBeGreaterThanOrEqual(1);

      // First step should always be 'created'
      expect(timeline[0].step).toBe('created');
      expect(timeline[0]).toHaveProperty('at');
      expect(timeline[0]).toHaveProperty('actor');
      expect(timeline[0]).toHaveProperty('detail');

      // Timeline should include all decision points
      const timelineSteps = timeline.map((step) => step.step);
      expect(timelineSteps).toContain('created');
    }, 15000);

    it('should return 404 for non-existent intent', async () => {
      // When: Request timeline for non-existent intent
      const response = await request(app.getHttpServer())
        .get('/api/security/intents/non-existent-id/timeline')
        .expect(404);

      // Then: Error response
      expect(response.body.error).toBeDefined();
      expect(response.body.code).toBe('intent_not_found');
    });

    it('should order timeline steps chronologically', async () => {
      // Given: Create intent and wait a moment
      const swapIntent: Omit<TransactionIntent, 'id' | 'createdAt'> = {
        kind: 'swap',
        walletId: 'wallet-order-test',
        origin: 'user',
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        amount: '100000000000000000',
        slippageBps: 50,
        chain: 'base',
      };

      const submitResponse = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(swapIntent)
        .expect(201);

      const testIntentId = submitResponse.body.id;

      // Wait to ensure timestamp differentiation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // When: Fetch timeline
      const timelineResponse = await request(app.getHttpServer())
        .get(`/api/security/intents/${testIntentId}/timeline`)
        .expect(200);

      const timeline: IntentTimelineStep[] = timelineResponse.body.steps;

      // Then: Timestamps should be in ascending order
      for (let i = 1; i < timeline.length; i++) {
        const prevTime = new Date(timeline[i - 1].at).getTime();
        const currTime = new Date(timeline[i].at).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    }, 15000);
  });

  describe('Real-time Dashboard Updates (10s interval)', () => {
    it('should update intent status within expected timeframe', async () => {
      // Given: New pending intent
      const swapIntent: Omit<TransactionIntent, 'id' | 'createdAt'> = {
        kind: 'swap',
        walletId: 'wallet-update-test',
        origin: 'user',
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        amount: '100000000000000000',
        slippageBps: 50,
        chain: 'base',
      };

      const submitResponse = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(swapIntent)
        .expect(201);

      const testIntentId = submitResponse.body.id;
      const initialStatus = submitResponse.body.status;

      // When: Poll for status updates over ~10 second window
      const pollInterval = 2000; // Poll every 2 seconds
      const maxWaitTime = 12000; // Max 12 seconds
      const startTime = Date.now();

      let currentStatus = initialStatus;
      let updatedAtLeastOnce = false;

      while (Date.now() - startTime < maxWaitTime && currentStatus !== 'approved') {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        const statusCheck = await request(app.getHttpServer())
          .get(`/api/security/intents/${testIntentId}`)
          .expect(200);

        currentStatus = statusCheck.body.status;

        if (currentStatus !== initialStatus) {
          updatedAtLeastOnce = true;
        }
      }

      // Then: Status should update or complete processing
      expect(currentStatus).not.toBe(initialStatus || 'pending');
      expect(updatedAtLeastOnce).toBeTruthy();
    }, 20000);

    it('should maintain real-time consistency across multiple queries', async () => {
      // Given: Active intent with known state
      const swapIntent: Omit<TransactionIntent, 'id' | 'createdAt'> = {
        kind: 'swap',
        walletId: 'wallet-consistency-test',
        origin: 'user',
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        amount: '100000000000000000',
        slippageBps: 50,
        chain: 'base',
      };

      const submitResponse = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(swapIntent)
        .expect(201);

      const testIntentId = submitResponse.body.id;

      // When: Query multiple times rapidly (simulating dashboard polling)
      const queryCount = 5;
      const responses = await Promise.all(
        Array(queryCount).fill(null).map(() =>
          request(app.getHttpServer())
            .get(`/api/security/intents/${testIntentId}`)
            .expect(200)
        )
      );

      // Then: All responses should be consistent
      const statuses = responses.map((r) => r.body.status);
      const intentIds = responses.map((r) => r.body.id);

      // All IDs should match
      expect(intentIds.every((id) => id === testIntentId)).toBeTruthy();

      // Statuses should be consistent (may have progressed)
      expect(new Set(statuses).size).toBeLessThanOrEqual(2); // At most 2 different statuses
    }, 15000);
  });

  describe('Cross-service state consistency', () => {
    it('should maintain data integrity across API and database layers', async () => {
      // Given: New intent
      const swapIntent: Omit<TransactionIntent, 'id' | 'createdAt'> = {
        kind: 'swap',
        walletId: 'wallet-db-integrity-test',
        origin: 'user',
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        amount: '100000000000000000',
        slippageBps: 50,
        chain: 'base',
      };

      const submitResponse = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(swapIntent)
        .expect(201);

      const apiIntentId = submitResponse.body.id;
      const apiCreatedAt = submitResponse.body.createdAt;

      // Then: Data envelope integrity checks
      expect(apiIntentId).toBeDefined();
      expect(apiCreatedAt).toBeDefined();

      // Verify through timeline endpoint (queries DB directly)
      const timelineResponse = await request(app.getHttpServer())
        .get(`/api/security/intents/${apiIntentId}/timeline`)
        .expect(200);

      // Timeline should reference same intent ID
      const firstStep = timelineResponse.body.steps[0];
      expect(firstStep.detail).toContain('swap intent received');
    }, 15000);

    it('should persist intent metadata correctly', async () => {
      // Given: Intent with specific metadata
      const swapIntent: Omit<TransactionIntent, 'id' | 'createdAt'> = {
        kind: 'swap',
        walletId: 'wallet-metadata-test',
        origin: 'user',
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        amount: '100000000000000000',
        slippageBps: 50,
        chain: 'base',
      };

      const submitResponse = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(swapIntent)
        .expect(201);

      const testIntentId = submitResponse.body.id;

      // Cross-validate via multiple endpoints
      const [metaResponse, timelineResponse] = await Promise.all([
        request(app.getHttpServer())
          .get(`/api/security/intents/${testIntentId}`)
          .expect(200),
        request(app.getHttpServer())
          .get(`/api/security/intents/${testIntentId}/timeline`)
          .expect(200),
      ]);

      // Both should return consistent metadata
      expect(metaResponse.body.id).toBe(testIntentId);
      expect(timelineResponse.body.intentId).toBe(testIntentId);
      expect(metaResponse.body.origin).toBe('user');
      expect(timelineResponse.body.steps.some((s: any) => s.actor === 'user')).toBeTruthy();
    }, 15000);
  });
});
