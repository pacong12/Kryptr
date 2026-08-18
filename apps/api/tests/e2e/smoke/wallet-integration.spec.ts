/**
 * Wallet Integration E2E Smoke Test
 * Validates: GET /api/wallets/:id/balances flow
 * Purpose: End-to-end wallet balance retrieval with DB consistency verification
 * Milestone: W7-M1 (Wallet Detail)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app/app.module';
import { DatabaseHarness } from '../../harness/database-harness';
import { WalletRepository } from '../../../src/wallet/domain/wallet-repository.port';
import { WALLET_REPOSITORY } from '../../../src/wallet/domain/wallet-repository.port';
import { CreateWalletUseCase } from '../../../src/wallet/application/create-wallet.usecase';
import { WalletEntity } from '../../../src/wallet/domain/entities/wallet.entity';
import { ENVIRONMENT } from '../../../src/config/env';
import { itPostgres, postgresTestUrl } from '../../../../test/env-gate';

describe('Wallet Integration E2E', () => {
  let app: INestApplication;
  let databaseHarness: DatabaseHarness;
  let createWallet: CreateWalletUseCase;
  let walletRepository: WalletRepository;

  beforeAll(async () => {
    // Skip if no database available
    const postgresUrl = postgresTestUrl();
    if (!postgresUrl) {
      console.warn('[WalletE2E] Skipping - No DATABASE_URL available');
      return;
    }

    // Setup database harness for clean state
    databaseHarness = new DatabaseHarness(postgresUrl);
    await databaseHarness.setup();

    // Setup application
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ENVIRONMENT.WORKER_CONFIG)
      .useValue({ QUEUE_NAME: 'test-queue' })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Inject dependencies for test setup
    walletRepository = moduleFixture.get(WALLET_REPOSITORY);
    createWallet = moduleFixture.get(CreateWalletUseCase);

    // Start application HTTP server
    await app.listen();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (databaseHarness) {
      await databaseHarness.cleanup();
    }
  });

  beforeEach(async () => {
    // Clean test data before each test
    await databaseHarness.clearTables(['wallets']);
  });

  describe('GET /api/wallets/:id/balances', () => {
    it('should return balances for existing wallet', async () => {
      // Given: Create a test wallet in database
      const testWalletData = {
        name: 'Smoke Test Wallet',
        address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        chains: ['ethereum', 'polygon'],
      };

      const walletId = await createWallet.execute(testWalletData);

      // When: Fetch wallet balances
      const response = await request(app.getHttpServer())
        .get(`/api/wallets/${walletId}/balances`)
        .expect(200);

      // Then: Validate response structure
      expect(response.body).toHaveProperty('walletId');
      expect(response.body.walletId).toBe(walletId);
      expect(Array.isArray(response.body.balances)).toBeTruthy();

      // Verify all expected chains are present
      const chainAddresses = response.body.balances.map((b: any) => b.chain);
      expect(chainAddresses).toContain('ethereum');
      expect(chainAddresses).toContain('polygon');

      // Verify DB consistency: Check wallet exists in database
      const dbWallet = await walletRepository.findById(walletId);
      expect(dbWallet).toBeDefined();
      expect(dbWallet!.name).toBe(testWalletData.name);
    });

    it('should return 404 for non-existent wallet', async () => {
      // When: Try to fetch balances for non-existent wallet
      const response = await request(app.getHttpServer())
        .get('/api/wallets/nonexistent-id/balances')
        .expect(404);

      // Then: Validate error structure
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
    });

    it('should calculate native balance from chain reader', async () => {
      // Given: Create a test wallet
      const testWalletData = {
        name: 'Native Balance Test',
        address: '0x1234567890abcdef1234567890abcdef12345678',
        chains: ['ethereum'],
      };

      const walletId = await createWallet.execute(testWalletData);

      // When: Fetch balances
      const response = await request(app.getHttpServer())
        .get(`/api/wallets/${walletId}/balances`)
        .expect(200);

      // Then: Validate balance structure includes native balance
      const ethBalance = response.body.balances.find(
        (b: any) => b.chain === 'ethereum'
      );
      
      expect(ethBalance).toBeDefined();
      expect(ethBalance).toHaveProperty('nativeBalance');
      expect(typeof ethBalance.nativeBalance).toBe('string');
      expect(ethBalance.nativeBalance).toMatch(/^\d+$/);
    });

    it('should aggregate token balances per chain', async () => {
      // Given: Create a test wallet
      const testWalletData = {
        name: 'Token Aggregation Test',
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        chains: ['ethereum'],
      };

      const walletId = await createWallet.execute(testWalletData);

      // When: Fetch balances
      const response = await request(app.getHttpServer())
        .get(`/api/wallets/${walletId}/balances`)
        .expect(200);

      // Then: Validate token array structure
      const ethBalance = response.body.balances.find(
        (b: any) => b.chain === 'ethereum'
      );

      expect(ethBalance).toBeDefined();
      expect(Array.isArray(ethBalance.tokens)).toBeTruthy();
      
      // Each token should have required fields
      ethBalance.tokens.forEach((token: any) => {
        expect(token).toHaveProperty('address');
        expect(token).toHaveProperty('balance');
        expect(token).toHaveProperty('decimals');
        expect(token).toHaveProperty('symbol');
      });
    });

    it('should handle multiple wallets concurrently', async () => {
      // Given: Create multiple test wallets
      const wallets = await Promise.all([
        createWallet.execute({
          name: 'Wallet 1',
          address: '0xWallet1Address123456789012345678901234',
          chains: ['ethereum'],
        }),
        createWallet.execute({
          name: 'Wallet 2',
          address: '0xWallet2Address123456789012345678901234',
          chains: ['polygon'],
        }),
        createWallet.execute({
          name: 'Wallet 3',
          address: '0xWallet3Address123456789012345678901234',
          chains: ['ethereum', 'arbitrum'],
        }),
      ]);

      // When: Fetch all wallet balances concurrently
      const responses = await Promise.all(
        wallets.map((walletId) =>
          request(app.getHttpServer()).get(
            `/api/wallets/${walletId}/balances`
          )
        )
      );

      // Then: All responses should be successful
      expect(responses.length).toBe(3);
      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.walletId).toBe(wallets[index]);
        
        // Verify DB consistency for each wallet
        expect(response.body.balances).toBeDefined();
      });
    }, 15000);
  });

  describe('Cross-service data integrity', () => {
    it('should maintain wallet ID consistency across API and DB', async () => {
      // Given: Create a test wallet
      const testData = {
        name: 'ID Consistency Test',
        address: '0xConsistencyTest12345678901234567890123',
        chains: ['ethereum'],
      };

      const walletId = await createWallet.execute(testData);

      // When: Query wallet via API
      const apiResponse = await request(app.getHttpServer())
        .get(`/api/wallets/${walletId}/balances`)
        .expect(200);

      // Then: Extract wallet info from API response
      const apiWalletId = apiResponse.body.walletId;
      
      // Cross-validate: Query direct from database
      const dbWallet = await walletRepository.findById(walletId);
      
      // Verify ID consistency
      expect(apiWalletId).toBe(walletId);
      expect(dbWallet?.name).toBe(testData.name);
      
      // Data envelope integrity check
      expect(apiResponse.headers['content-type']).toContain('application/json');
      expect(apiResponse.body.id).toBeDefined();
    });

    it('should persist wallet creation timestamp correctly', async () => {
      // Given: Create a test wallet
      const beforeCreate = Date.now();
      const testData = {
        name: 'Timestamp Test',
        address: '0xTimestampTest123456789012345678901234',
        chains: ['ethereum'],
      };

      const walletId = await createWallet.execute(testData);
      const afterCreate = Date.now();

      // When: Fetch wallet details
      const response = await request(app.getHttpServer())
        .get(`/api/wallets/${walletId}/balances`)
        .expect(200);

      // Then: Validate timestamps are within reasonable range
      const createdAt = new Date(response.body.createdAt).getTime();
      expect(createdAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(createdAt).toBeLessThanOrEqual(afterCreate + 1000); // Allow 1s clock skew
    });
  });
});
