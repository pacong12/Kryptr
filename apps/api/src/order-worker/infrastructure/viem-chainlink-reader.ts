import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import type { ChainlinkRoundReader } from './chainlink-trigger-price';

/**
 * Minimal Chainlink AggregatorV3 read seam. The viem import stays
 * confined here (wave-3 lesson); specs stub ChainlinkRoundReader.
 * Keyless — reads only, never signs.
 */
const AGGREGATOR_V3_ABI = [
  {
    name: 'latestRoundData',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
] as const;

export class ViemChainlinkReader implements ChainlinkRoundReader {
  private readonly client;

  constructor(options: { rpcUrl?: string } = {}) {
    this.client = createPublicClient({
      chain: base,
      transport: http(options.rpcUrl ?? process.env.RPC_URL_BASE),
    });
  }

  async latestRoundData(feed: `0x${string}`): Promise<{
    answer: bigint;
    updatedAt: bigint;
  }> {
    const [, answer, , updatedAt] = await this.client.readContract({
      address: feed,
      abi: AGGREGATOR_V3_ABI,
      functionName: 'latestRoundData',
    });
    return { answer, updatedAt };
  }
}
