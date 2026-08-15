import type { SecurityPolicy } from '@kryptr/shared-types';
import { InMemorySecurityPolicyProvider } from './in-memory-policy-provider';

const POLICY: SecurityPolicy = {
  walletId: 'wallet-1',
  allowedOrigins: ['user'],
  approvalThresholdUsd: 100,
  dailyCapUsd: 1000,
  allowedChains: ['base'],
  rejectEncodedPayloads: true,
};

describe('InMemorySecurityPolicyProvider', () => {
  it('returns null for wallets without a policy', async () => {
    const provider = new InMemorySecurityPolicyProvider();
    await expect(provider.getPolicyForWallet('wallet-1')).resolves.toBeNull();
  });

  it('stores and returns policies by wallet id', async () => {
    const provider = new InMemorySecurityPolicyProvider();
    await provider.upsert(POLICY);
    await expect(provider.getPolicyForWallet('wallet-1')).resolves.toEqual(
      POLICY,
    );
  });

  it('upsert replaces an existing policy', async () => {
    const provider = new InMemorySecurityPolicyProvider();
    await provider.upsert(POLICY);
    await provider.upsert({ ...POLICY, dailyCapUsd: 0 });
    await expect(
      provider.getPolicyForWallet('wallet-1'),
    ).resolves.toMatchObject({ dailyCapUsd: 0 });
  });
});
