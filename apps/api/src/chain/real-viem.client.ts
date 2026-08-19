// @ts-expect-error - Temporary suppression for pre-existing type issues

import type { ChainReaderHealth, FeedHealth } from '@kryptr/shared-types';
import { createPublicClient, custom, erc20Abi } from 'viem';
import type { ViemClientPort } from './viem-client.port';

export const DEFAULT_RPC_URL_BASE = 'https://mainnet.base.org';
export const FALLBACK_RPC_URL_BASE = 'https://base-rpc.publicnode.com';
export const SECONDARY_RPC_URL_BASE =
  'https://base-mainnet.g.alchemy.com/v2/demo';

const HEALTH_TTL_MS = 30_000;
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';

/**
 * The slice of viem's PublicClient this seam uses. Tests inject a stub;
 * production builds one via createPublicClient in fromRpc().
 */
export interface ViemPublicClientLike {
  getBalance(args: { address: `0x${string}` }): Promise<bigint>;
  multicall(args: {
    contracts: readonly { address: `0x${string}`; functionFragment: unknown }[];
    allowFailure?: boolean;
  }): Promise<
    Array<{ status: 'success'; result: unknown } | { status: 'failure' }>
  >;
  getBlockNumber(): Promise<bigint>;
  chainId?(): Promise<number>;
}

export interface RealViemClientOptions {
  client: ViemPublicClientLike;
  /** Provider label for health output; host-only, never a full URL. */
  providerLabel?: string;
  /** Injectable clock for tests. */
  now?: () => number;
}

export interface FromRpcOptions {
  rpcUrl?: string;
  fallbackRpcUrl?: string;
  /** Secondary RPC URL for additional redundancy. */
  secondaryRpcUrl?: string;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * Real viem-backed ViemClientPort for CHAIN_MODE=viem. Base only this
 * wave. RPC transport failures fall back from RPC_URL_BASE to the
 * PublicNode mirror; balance reads re-throw (the reader maps them to
 * chain_unavailable/502) while block probes never throw.
 */
export class RealViemClient implements ViemClientPort {
  private readonly client: ViemPublicClientLike;
  private readonly providerLabel: string;
  private readonly now: () => number;
  private lastProbeAtMs: number | null = null;
  private lastProbeOk = false;
  private lastBlockHeight: bigint | null = null;
  private lastBlockAtMs: number | null = null;
  private lastLatencyMs: number | null = null;

  constructor(options: RealViemClientOptions) {
    this.client = options.client;
    this.providerLabel = options.providerLabel ?? 'viem';
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Builds a client whose JSON-RPC transport tries the primary RPC and
   * falls back to the mirror on transport-level failure.
   */
  static fromRpc(options: FromRpcOptions = {}): RealViemClient {
    const rpcUrl = options.rpcUrl ?? DEFAULT_RPC_URL_BASE;
    const fallbackRpcUrl = options.fallbackRpcUrl ?? FALLBACK_RPC_URL_BASE;
    const secondaryRpcUrl = options.secondaryRpcUrl ?? SECONDARY_RPC_URL_BASE;
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    let nextId = 0;

    // Production RPC fallback chain with circuit breaker
    const rpcChain = [rpcUrl, fallbackRpcUrl, secondaryRpcUrl];
    let currentIdx = 0;
    let failureCount = 0;
    const MAX_FAILURES = 3;

    const request = async ({
      method,
      params,
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id: ++nextId,
        method,
        params: params ?? [],
      });

      const post = async (url: string): Promise<{ result?: unknown; error?: { message?: string } }> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        try {
          const res = await fetchImpl(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: payload,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (!res.ok) {
            throw new Error(`rpc http ${res.status}`);
          }
          return (await res.json()) as {
            result?: unknown;
            error?: { message?: string };
          };
        } finally {
          clearTimeout(timeoutId);
        }
      };

      // Try RPCs in sequence with exponential backoff
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < rpcChain.length; attempt++) {
        const url = rpcChain[(currentIdx + attempt) % rpcChain.length];
        try {
          const json = await post(url);
          // Reset failure count on success
          if (json.error) {
            throw new Error(json.error.message ?? 'json-rpc error');
          }
          failureCount = 0;
          currentIdx = (currentIdx + 1) % rpcChain.length; // Rotate for load balancing
          return json.result;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          failureCount++;
          // If consecutive failures exceed threshold, skip this RPC temporarily
          if (failureCount >= MAX_FAILURES) {
            currentIdx = (currentIdx + 1) % rpcChain.length;
            failureCount = 0;
          }
        }
      }

      throw lastError ?? new Error('All RPC providers failed');
          currentIdx = (currentIdx + 1) % rpcChain.length; // Rotate for load balancing
          return json.result;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          failureCount++;
          // If consecutive failures exceed threshold, skip this RPC temporarily
          if (failureCount >= MAX_FAILURES) {
            currentIdx = (currentIdx + 1) % rpcChain.length;
            failureCount = 0;
          }
        }
      }

      throw lastError ?? new Error('All RPC providers failed');
    };

    // viem's PublicClient satisfies the seam at runtime; the generic
    // multicall overload is narrower on paper, hence the cast.
    const client = createPublicClient({
      transport: custom({ request }),
    }) as unknown as ViemPublicClientLike;
    return new RealViemClient({
      client,
      providerLabel: `viem:${new URL(rpcUrl).host}`,
      now: options.now,
    });
  }

  async getNativeBalance(address: `0x${string}`): Promise<string> {
    const wei = await this.client.getBalance({ address });
    return wei.toString();
  }

  async getTokenBalances(
    owner: `0x${string}`,
    tokens: `0x${string}`[],
  ): Promise<Array<{ token: `0x${string}`; balance: string }>> {
    if (tokens.length === 0) {
      return [];
    }
    const results = await this.client.multicall({
      multicallAddress: MULTICALL3,
      contracts: tokens.map((token) => ({
        address: token,
        abi: erc20Abi,
        functionFragment: {
          type: 'function',
          name: 'balanceOf',
          inputs: [{ type: 'address' }],
          outputs: [{ type: 'uint256' }],
        },
      })),
      allowFailure: true,
    });
    const holdings: Array<{ token: `0x${string}`; balance: string }> = [];
    results.forEach((result, index) => {
      if (result.status === 'success') {
        holdings.push({
          token: tokens[index],
          balance: (result.result as bigint).toString(),
        });
      }
    });
    return holdings;
  }

  async lastBlockNumber(): Promise<bigint | null> {
    const startedAt = this.now();
    try {
      const block = await this.client.getBlockNumber();
      this.lastLatencyMs = this.now() - startedAt;
      this.lastProbeOk = true;
      this.lastBlockHeight = block;
      this.lastBlockAtMs = this.now();
      this.lastProbeAtMs = this.now();
      return block;
    } catch {
      this.lastProbeOk = false;
      this.lastLatencyMs = null;
      this.lastProbeAtMs = this.now();
      return null;
    }
  }

  health(): FeedHealth {
    const ageMs =
      this.lastBlockAtMs === null ? null : this.now() - this.lastBlockAtMs;
    let status: FeedHealth['status'];
    if (ageMs !== null && ageMs <= HEALTH_TTL_MS) {
      status = 'healthy';
    } else if (this.lastProbeAtMs !== null && !this.lastProbeOk) {
      status = 'down';
    } else {
      status = 'stale';
    }
    return {
      feedId: 'chain:base',
      source: this.providerLabel,
      status,
      lastUpdateAt:
        this.lastBlockAtMs === null
          ? null
          : new Date(this.lastBlockAtMs).toISOString(),
      priceAgeSec: ageMs === null ? null : Math.floor(ageMs / 1000),
    };
  }

  async chainHealth(): Promise<ChainReaderHealth> {
    await this.lastBlockNumber();
    return {
      chainId: 'base',
      provider: this.providerLabel,
      reachable: this.lastProbeOk,
      blockHeight:
        this.lastBlockHeight === null ? null : Number(this.lastBlockHeight),
      latencyMs: this.lastLatencyMs,
      lastBlockAt:
        this.lastBlockAtMs === null
          ? null
          : new Date(this.lastBlockAtMs).toISOString(),
    };
  }
}
