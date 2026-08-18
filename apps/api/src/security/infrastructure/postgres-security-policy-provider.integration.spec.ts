import { describePostgres } from '../../test/env-gate';
import {
  disconnectTestClient,
  makePostgresTestClient,
  truncateAllTables,
} from '../../test/postgres-harness';
import { PostgresWalletRepository } from '../../wallet/infrastructure/postgres-wallet.repository';
import { PostgresSecurityPolicyProvider } from './postgres-security-policy-provider';
import type { PrismaClient } from '../../generated/prisma/client';
import type { AgentWallet, SecurityPolicy } from '@kryptr/shared-types';

describePostgres('PostgresSecurityPolicyProvider (S1 Fase 3, live Postgres)', () => {
  let db: PrismaClient;
  let walletRepo: PostgresWalletRepository;
  let policyProvider: PostgresSecurityPolicyProvider;

  const walletAddr = '0x1111111111111111111111111111111111111111';

  beforeEach(async () => {
    db = makePostgresTestClient();
    await truncateAllTables(db);
    walletRepo = new PostgresWalletRepository(db);
    policyProvider = new PostgresSecurityPolicyProvider(db);

    const wallet: AgentWallet = {
      id: walletAddr,
      address: walletAddr as `0x${string}`,
      ownerId: 'owner-1',
      chains: ['base'],
      createdAt: '2026-08-17T00:00:00.000Z',
      lastKeyRotationAt: null,
    };
    await walletRepo.save(wallet);
  });

  afterEach(async () => {
    await disconnectTestClient(db);
  });

  it('returns null for wallet with no policy', async () => {
    const policy = await policyProvider.getPolicyForWallet(walletAddr);
    expect(policy).toBeNull();
  });

  it('upserts and retrieves security policy converting micros <-> USD floats', async () => {
    const original: SecurityPolicy = {
      walletId: walletAddr,
      allowedOrigins: ['http://localhost:3000'],
      approvalThresholdUsd: 50.5,
      dailyCapUsd: 500.25,
      allowedChains: ['base'],
      rejectEncodedPayloads: true,
    };

    await policyProvider.upsert(original);

    const fetched = await policyProvider.getPolicyForWallet(walletAddr);
    expect(fetched).toEqual({
      walletId: walletAddr,
      allowedOrigins: ['http://localhost:3000'],
      approvalThresholdUsd: 50.5,
      dailyCapUsd: 500.25,
      allowedChains: ['base'],
      rejectEncodedPayloads: true,
    });
  });

  it('address lookup is case-insensitive', async () => {
    const original: SecurityPolicy = {
      walletId: walletAddr,
      allowedOrigins: ['*'],
      approvalThresholdUsd: 100,
      dailyCapUsd: 1000,
      allowedChains: ['base', 'robinhood-chain'],
      rejectEncodedPayloads: false,
    };

    await policyProvider.upsert(original);

    const fetched = await policyProvider.getPolicyForWallet(
      '0x1111111111111111111111111111111111111111'.toUpperCase(),
    );
    expect(fetched?.walletId).toBe(walletAddr);
  });
});
