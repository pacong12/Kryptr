import { Injectable } from '@nestjs/common';
import type { SecurityPolicy } from '@kryptr/shared-types';
import type { SecurityPolicyProvider } from '../application/ports';

/**
 * In-memory policy store (Wave 1). Wave 2 swaps it for a Prisma-backed
 * provider; the gate and wallet provisioning only depend on the
 * SecurityPolicyProvider port.
 */
@Injectable()
export class InMemorySecurityPolicyProvider implements SecurityPolicyProvider {
  private readonly policies = new Map<string, SecurityPolicy>();

  async getPolicyForWallet(walletId: string): Promise<SecurityPolicy | null> {
    return this.policies.get(walletId) ?? null;
  }

  async upsert(policy: SecurityPolicy): Promise<void> {
    this.policies.set(policy.walletId, policy);
  }
}
