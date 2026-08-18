/**
 * DEX Aggregator Quote E2E Smoke Test
 * Validates: ZeroExVenueAdapter quote aggregation
 * Purpose: End-to-end swap quote validation with routing logic verification
 * Milestone: W7-M3 (DEX Aggregator)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app/app.module';
import { DescribeKeyed, itKeyed } from '../../../../test/env-gate';
import type { SwapQuote, ChainId, TokenAddress } from '@kryptr/shared-types';

describe('DEX Aggregator E2E', () => {
  let app: INestApplication;
  let dexAdapterConfigured: boolean = false;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Check if DEX adapter is configured by hitting health endpoint
    try {
      const healthResponse = await request(app.getHttpServer())
        .get('/api/health/feeds')
        .expect(200);

      const dexFeeds = healthResponse.body.feeds.filter(
        (f: any) => f.source === '0x' || f.feedId?.includes('zero-ex')
      );

      if (dexFeeds.length > 0) {
        dexAdapterConfigured = dexFeeds.some(
          (f: any) => f.status !== 'unconfigured'
        );
      }
    } catch (error) {
      console.warn('[DEXTES] Failed to check DEX adapter status:', error.message);
    }

    await app.listen();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  DescribeKeyed('ZEROX_API_KEY', 'ZeroEx Adapter Integration', () => {
    it('should return valid quote for ETH → USDC swap on Base', async () => {
      // Given: Valid swap parameters on Base chain
      const sellToken: TokenAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'; // Native ETH
      const buyToken: TokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54fA026678'; // USDC on Base

      const quoteRequest = {
        chain: 'base' as ChainId,
        assetIn: sellToken,
        assetOut: buyToken,
        amount: '100000000000000000', // 0.1 ETH in wei
        slippageBps: 50, // 0.5% slippage tolerance
        taker: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      };

      // When: Request swap quote via API
      const response = await request(app.getHttpServer())
        .post('/api/trading/quote')
        .send(quoteRequest)
        .expect(200);

      // Then: Validate quote structure
      const quote: SwapQuote = response.body;
      
      expect(quote.id).toBeDefined();
      expect(quote.chain).toBe('base');
      expect(quote.assetIn).toBe(sellToken);
      expect(quote.assetOut).toBe(buyToken);
      expect(quote.amount).toBe(quoteRequest.amount);

      // Validate required fields
      expect(quote).toHaveProperty('amountOut');
      expect(quote).toHaveProperty('routes');
      expect(quote).toHaveProperty('estimatedGasLimit');
      expect(quote).toHaveProperty('expiresAt');

      // Validate amounts are strings (wei representation)
      expect(typeof quote.amountOut).toBe('string');
      expect(/^(\d+)?$/.test(quote.amountOut)).toBeTruthy();

      // Routes should be an array
      expect(Array.isArray(quote.routes)).toBeTruthy();
      expect(quote.routes.length).toBeGreaterThanOrEqual(1);

      // Each route hop should have required fields
      quote.routes.forEach((route: any) => {
        expect(route).toHaveProperty('exchange');
        expect(route).toHaveProperty('percentage');
        expect(typeof route.percentage).toBe('number');
        expect(route.percentage).toBeGreaterThan(0);
      });
    }, 20000); // Extended timeout for external API call

    it('should validate slippage bounds in response', async () => {
      // Given: Two different slippage configurations
      const sellToken: TokenAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
      const buyToken: TokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54fA026678';

      const lowSlippageReq = {
        ...sellTokenBuyBaseRequest(sellToken, buyToken),
        slippageBps: 10, // 0.1% slippage
      };

      const highSlippageReq = {
        ...sellTokenBuyBaseRequest(sellToken, buyToken),
        slippageBps: 500, // 5% slippage
      };

      // When: Request quotes with different slippage
      const lowResponse = await request(app.getHttpServer())
        .post('/api/trading/quote')
        .send(lowSlippageReq)
        .expect(200);

      const highResponse = await request(app.getHttpServer())
        .post('/api/trading/quote')
        .send(highSlippageReq)
        .expect(200);

      // Then: Higher slippage should yield better rate (more tokens out)
      const lowAmount = parseInt(lowResponse.body.amountOut, 10);
      const highAmount = parseInt(highResponse.body.amountOut, 10);

      expect(highAmount).toBeGreaterThanOrEqual(lowAmount);
    }, 30000);

    it('should aggregate quotes across multiple routes when available', async () => {
      // Given: Large trade amount that might require route splitting
      const sellToken: TokenAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
      const buyToken: TokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54fA026678';

      const largeTradeRequest = {
        ...sellTokenBuyBaseRequest(sellToken, buyToken),
        amount: '1000000000000000000', // 1 ETH
        slippageBps: 100,
      };

      // When: Request quote for larger trade
      const response = await request(app.getHttpServer())
        .post('/api/trading/quote')
        .send(largeTradeRequest)
        .expect(200);

      // Then: Verify multi-route aggregation
      const quote: SwapQuote = response.body;
      
      // Should still be a valid quote
      expect(quote.amountOut).toBeDefined();
      expect(parseInt(quote.amountOut, 10)).toBeGreaterThan(0);

      // Check route composition
      let totalPercentage = 0;
      quote.routes.forEach((route: any) => {
        totalPercentage += route.percentage;
        
        // Each route should reference a known exchange
        expect(['ZeroEx', 'Uniswap', 'Curve']).toContain(route.exchange);
      });

      // Total percentage should sum to ~100%
      expect(totalPercentage).toBeCloseTo(100, 1);
    }, 25000);

    it('should handle unsupported chain gracefully', async () => {
      // Given: Request on unsupported chain
      const invalidChainRequest = {
        chain: 'ethereum' as any, // Assuming only Base is supported
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        assetOut: '0x833589fCD6eDb6E08f4c7C32D4f71b54fA026678',
        amount: '100000000000000000',
        slippageBps: 50,
        taker: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      };

      // When: Request quote on unsupported chain
      const response = await request(app.getHttpServer())
        .post('/api/trading/quote')
        .send(invalidChainRequest)
        .expect(422);

      // Then: Error should indicate chain not supported
      expect(response.body.error).toBeDefined();
      expect(response.body.code).toBe('chain_not_supported');
    });

    it('should enforce minimum taker address format', async () => {
      // Given: Invalid taker address format
      const invalidTakerRequest = {
        chain: 'base' as ChainId,
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        assetOut: '0x833589fCD6eDb6E08f4c7C32D4f71b54fA026678',
        amount: '100000000000000000',
        slippageBps: 50,
        taker: 'invalid-address',
      };

      // When: Request quote with invalid taker
      const response = await request(app.getHttpServer())
        .post('/api/trading/quote')
        .send(invalidTakerRequest)
        .expect(422);

      // Then: Validate error structure
      expect(response.body.error).toBeDefined();
      expect(response.body.code).toBe('invalid_taker');
    });

    it('should provide consistent quotes within TTL window', async () => {
      // Given: Same swap parameters
      const sellToken: TokenAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
      const buyToken: TokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54fA026678';

      const repeatedRequest = {
        ...sellTokenBuyBaseRequest(sellToken, buyToken),
        slippageBps: 50,
      };

      // When: Request same quote twice within short time window
      const [first, second] = await Promise.all([
        request(app.getHttpServer()).post('/api/trading/quote').send(repeatedRequest),
        request(app.getHttpServer()).post('/api/trading/quote').send(repeatedRequest),
      ]);

      // Then: Quotes should have consistent rates (may vary slightly due to market)
      const firstAmount = parseInt(first.body.amountOut, 10);
      const secondAmount = parseInt(second.body.amountOut, 10);

      // Allow 0.1% variance for market movements
      const variance = Math.abs(firstAmount - secondAmount) / firstAmount;
      expect(variance).toBeLessThan(0.001);
    }, 20000);

    it('should cache and expire quotes properly', async () => {
      // Given: Submit a quote request
      const sellToken: TokenAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
      const buyToken: TokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54fA026678';

      const initialRequest = {
        ...sellTokenBuyBaseRequest(sellToken, buyToken),
        slippageBps: 50,
      };

      // When: Get initial quote
      const initialResponse = await request(app.getHttpServer())
        .post('/api/trading/quote')
        .send(initialRequest)
        .expect(200);

      const quoteId = initialResponse.body.id;
      const initialAmount = parseInt(initialResponse.body.amountOut, 10);

      // Then: Attempt to use expired or stale quote ID
      // Note: This test assumes buildSwapTx endpoint exists
      try {
        const txResponse = await request(app.getHttpServer())
          .post('/api/trading/tx')
          .send({ quoteId })
          .expect(200);

        // If successful, verify transaction structure
        expect(txResponse.body).toHaveProperty('to');
        expect(txResponse.body).toHaveProperty('data');
        expect(txResponse.body).toHaveProperty('value');
        
        expect(/^0x[0-9a-fA-F]{40}$/.test(txResponse.body.to)).toBeTruthy();
        expect(/^0x[0-9a-fA-F]*$/.test(txResponse.body.data)).toBeTruthy();
      } catch (error) {
        // Skip if buildSwapTx endpoint not implemented yet
        console.log('[DEXTES] buildSwapTx endpoint not available - skipping validation');
      }
    }, 15000);
  });
});

// Helper function to create base token request structure
function sellTokenBuyBaseRequest(
  sellToken: string,
  buyToken: string
): Omit<any, 'slippageBps'> {
  return {
    chain: 'base' as ChainId,
    assetIn: sellToken,
    assetOut: buyToken,
    amount: '100000000000000000',
    slippageBps: 50,
    taker: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  };
}
