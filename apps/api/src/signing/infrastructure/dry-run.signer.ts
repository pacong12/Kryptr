import type {
  ChainId,
  SignRequest,
  UnsignedTxPreview,
} from '@kryptr/shared-types';
import { encodePacked, keccak256 } from 'viem';
import type { SignerPort } from '../domain/signer.port';

/**
 * Wave-3 signer: computes the digest that WOULD be signed and stops
 * there. Hashing unsigned calldata needs no key, and the result can
 * never be broadcast. A real signer (Privy-style external wallet)
 * replaces this class behind the same SignerPort.
 */

/** EVM chainIds for digest computation (phase-1 chains). */
const EVM_CHAIN_IDS: Partial<Record<ChainId, bigint>> = {
  base: 8453n,
  'robinhood-chain': 4663n,
};

const DRY_RUN_NOTE = 'dry-run only — nothing broadcast';

export interface DryRunSignerOptions {
  /** Injectable clock for tests. */
  now?: () => number;
}

export class DryRunSigner implements SignerPort {
  private readonly now: () => number;
  private readonly requests = new Map<string, SignRequest>();
  private sequence = 0;

  constructor(options: DryRunSignerOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  async requestSignature(input: {
    intentId: string;
    chain: ChainId;
    preview: UnsignedTxPreview;
  }): Promise<SignRequest> {
    this.sequence += 1;
    const request: SignRequest = {
      id: `dry-run-${this.sequence}`,
      intentId: input.intentId,
      status: 'dry_run',
      unsignedTx: { ...input.preview },
      digest: this.digestOf(input.chain, input.preview),
      note: DRY_RUN_NOTE,
      createdAt: new Date(this.now()).toISOString(),
    };
    this.requests.set(request.id, request);
    return { ...request };
  }

  async getStatus(id: string): Promise<SignRequest | null> {
    const stored = this.requests.get(id);
    return stored ? { ...stored } : null;
  }

  /**
   * keccak256 over (chainId, to, value, data) — the unsigned-tx digest
   * a signer would consume. Computed with viem hashing only; no key,
   * no signing primitive, ever.
   */
  private digestOf(chain: ChainId, preview: UnsignedTxPreview): `0x${string}` {
    const chainId = EVM_CHAIN_IDS[chain] ?? 0n;
    return keccak256(
      encodePacked(
        ['uint256', 'address', 'uint256', 'bytes'],
        [chainId, preview.to, BigInt(preview.value), preview.data],
      ),
    );
  }
}
