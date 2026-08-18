import type {
  ChainId,
  SignRequest,
  UnsignedTxPreview,
} from '@kryptr/shared-types';
import type { Prisma } from '@prisma/client';
import { encodePacked, keccak256 } from 'viem';
import type { SignerPort } from '../domain/signer.port';
import { getPrismaClient } from '../../persistence/prisma-client';
import type { PrismaClient } from '../../generated/prisma/client';

export interface PostgresSignerOptions {
  now?: () => number;
}

/**
 * Postgres-backed SignerPort implementation (Wave-6 S2).
 * Persists SignRequests to `sign_requests` table with atomic unique constraint on intent_id.
 * Maintains keyless fail-closed architecture by storing unsigned digests.
 */
export class PostgresSigner implements SignerPort {
  private readonly now: () => number;

  constructor(
    private readonly db: PrismaClient = getPrismaClient(),
    options: PostgresSignerOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  async requestSignature(input: {
    intentId: string;
    chain: ChainId;
    preview: UnsignedTxPreview;
  }): Promise<SignRequest> {
    const digest = this.digestOf(input.chain, input.preview);

    const rows = await this.db.$queryRawArray<
      | {
          id: string;
          intentId: string;
          status: string;
          unsignedTx: unknown;
          digest: string | null;
          note: string | null;
          createdAt: Date;
        }
      | never
    >`
      INSERT INTO sign_requests (id, intent_id, status, unsigned_tx, digest, note, created_at)
      VALUES (
        ${`sr-${input.intentId}`},
        ${input.intentId},
        'dry_run',
        ${JSON.stringify(input.preview)}::jsonb,
        ${digest},
        'dry-run only — persisted to postgres',
        ${new Date(this.now())}
      )
      ON CONFLICT (intent_id) DO NOTHING
      RETURNING *
    `;

    if (rows.length === 0) {
      // Conflict occurred - already exists, return existing
      const existing = await this.getStatus(input.intentId);
      return existing!;
    }

    return this.mapEntity(rows[0]);
  }

  async getStatus(id: string): Promise<SignRequest | null> {
    const row = await this.db.signRequest.findFirst({
      where: {
        OR: [{ id }, { intentId: id }],
      },
    });

    if (!row) return null;
    return this.mapEntity(row);
  }

  private digestOf(chain: ChainId, preview: UnsignedTxPreview): `0x${string}` {
    const chainIds: Record<string, bigint> = {
      base: 8453n,
      'robinhood-chain': 4663n,
    };
    const chainId = chainIds[chain] ?? 0n;
    return keccak256(
      encodePacked(
        ['uint256', 'address', 'uint256', 'bytes'],
        [chainId, preview.to, BigInt(preview.value), preview.data],
      ),
    );
  }

  private mapEntity(row: {
    id: string;
    intentId: string;
    status: string;
    unsignedTx: unknown;
    digest: string | null;
    note: string | null;
    createdAt: Date;
  }): SignRequest {
    return {
      id: row.id,
      intentId: row.intentId,
      status: row.status as SignRequest['status'],
      unsignedTx: row.unsignedTx as UnsignedTxPreview,
      digest: row.digest as `0x${string}` | null,
      note: row.note ?? '',
      createdAt: row.createdAt.toISOString(),
    };
  }
}
