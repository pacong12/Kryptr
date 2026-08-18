import type { ChainId, SecurityPolicy } from '@kryptr/shared-types';
import type { SecurityPolicyProvider } from '../application/ports';
import { getPrismaClient } from '../../persistence/prisma-client';
import type { PrismaClient } from '../../generated/prisma/client';

const MICROS_PER_USD = 1_000_000n;

/**
 * Postgres-backed SecurityPolicy provider (Wave-6 S1 persistence fase 3).
 * Conversion: USD floats <-> micros BigInt (`daily_cap_micros`, `approval_threshold_micros`).
 */
export class PostgresSecurityPolicyProvider implements SecurityPolicyProvider {
  constructor(private readonly db: PrismaClient = getPrismaClient()) {}

  async getPolicyForWallet(walletId: string): Promise<SecurityPolicy | null> {
    const address = walletId.toLowerCase();
    const row = await this.db.securityPolicy.findUnique({
      where: { walletAddress: address },
    });
    if (!row) return null;
    return this.mapEntity(row);
  }

  async upsert(policy: SecurityPolicy): Promise<void> {
    const address = policy.walletId.toLowerCase();
    const dailyCapMicros = BigInt(Math.round(policy.dailyCapUsd * 1_000_000));
    const approvalThresholdMicros = BigInt(
      Math.round(policy.approvalThresholdUsd * 1_000_000),
    );

    await this.db.securityPolicy.upsert({
      where: { walletAddress: address },
      create: {
        walletAddress: address,
        allowedOrigins: policy.allowedOrigins,
        dailyCapMicros,
        approvalThresholdMicros,
        allowedChains: policy.allowedChains,
        rejectEncodedPayloads: policy.rejectEncodedPayloads,
      },
      update: {
        allowedOrigins: policy.allowedOrigins,
        dailyCapMicros,
        approvalThresholdMicros,
        allowedChains: policy.allowedChains,
        rejectEncodedPayloads: policy.rejectEncodedPayloads,
      },
    });
  }

  private mapEntity(row: {
    walletAddress: string;
    allowedOrigins: string[];
    dailyCapMicros: bigint;
    approvalThresholdMicros: bigint;
    allowedChains: string[];
    rejectEncodedPayloads: boolean;
  }): SecurityPolicy {
    return {
      walletId: row.walletAddress,
      allowedOrigins: row.allowedOrigins,
      dailyCapUsd: Number(row.dailyCapMicros) / Number(MICROS_PER_USD),
      approvalThresholdUsd:
        Number(row.approvalThresholdMicros) / Number(MICROS_PER_USD),
      allowedChains: row.allowedChains as ChainId[],
      rejectEncodedPayloads: row.rejectEncodedPayloads,
    };
  }
}
