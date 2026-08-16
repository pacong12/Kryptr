import type { ChainlinkRoundReader } from './chainlink-trigger-price';
import {
  CHAINLINK_FEEDS,
  ChainlinkTriggerPrice,
} from './chainlink-trigger-price';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bfa02913' as const;
const UPDATED = BigInt(Math.floor(NOW / 1000) - 120);

function stubReader(
  rounds: Record<string, { answer: bigint; updatedAt: bigint }>,
): ChainlinkRoundReader {
  return {
    latestRoundData: async (feed) => {
      const round = rounds[feed];
      if (!round) {
        throw new Error(`no round for ${feed}`);
      }
      return round;
    },
  };
}

describe('ChainlinkTriggerPrice (stubbed viem seam)', () => {
  it('derives the pair price as base ÷ quote from two USD feeds', async () => {
    const feeds = CHAINLINK_FEEDS;
    const reader = stubReader({
      [feeds['base:native'].proxy]: {
        answer: 300_000_000_000n, // $3000.00 (8 dp)
        updatedAt: UPDATED,
      },
      [feeds[`base:${USDC}`].proxy]: {
        answer: 100_005_000n, // $1.00005 (8 dp)
        updatedAt: UPDATED - 30n,
      },
    });
    const trigger = new ChainlinkTriggerPrice(reader, {
      now: () => new Date(NOW),
    });
    const print = await trigger.getPrint({
      chain: 'base',
      baseAsset: null,
      quoteAsset: USDC,
    });
    expect(print).not.toBeNull();
    expect(print?.source).toBe('chainlink');
    expect(Number(print?.priceUsd)).toBeCloseTo(3000 / 1.00005, 6);
    // observedAt = the OLDER round (both must be fresh)
    expect(print?.observedAt).toBe(
      new Date(Number(UPDATED - 30n) * 1000).toISOString(),
    );
  });

  it('asset lookup is case-insensitive on the address', async () => {
    const feeds = CHAINLINK_FEEDS;
    const reader = stubReader({
      [feeds['base:native'].proxy]: { answer: 300_000_000_000n, updatedAt: UPDATED },
      [feeds[`base:${USDC}`].proxy]: { answer: 100_000_000n, updatedAt: UPDATED },
    });
    const trigger = new ChainlinkTriggerPrice(reader, {
      now: () => new Date(NOW),
    });
    const print = await trigger.getPrint({
      chain: 'base',
      baseAsset: null,
      quoteAsset: USDC.toUpperCase().replace('0X', '0x') as `0x${string}`,
    });
    expect(print).not.toBeNull();
  });

  it('returns null for an unregistered asset or chain (fail-closed)', async () => {
    const trigger = new ChainlinkTriggerPrice(stubReader({}), {
      now: () => new Date(NOW),
    });
    const unknownAsset = await trigger.getPrint({
      chain: 'base',
      baseAsset: '0x1111111111111111111111111111111111111111',
      quoteAsset: USDC,
    });
    const unknownChain = await trigger.getPrint({
      chain: 'polygon',
      baseAsset: null,
      quoteAsset: USDC,
    });
    expect(unknownAsset).toBeNull();
    expect(unknownChain).toBeNull();
  });

  it('returns null when the RPC read fails (never a stale pass)', async () => {
    const failing: ChainlinkRoundReader = {
      latestRoundData: async () => {
        throw new Error('rpc down');
      },
    };
    const trigger = new ChainlinkTriggerPrice(failing, {
      now: () => new Date(NOW),
    });
    const print = await trigger.getPrint({
      chain: 'base',
      baseAsset: null,
      quoteAsset: USDC,
    });
    expect(print).toBeNull();
  });

  it('returns null on non-positive answers', async () => {
    const feeds = CHAINLINK_FEEDS;
    const reader = stubReader({
      [feeds['base:native'].proxy]: { answer: 0n, updatedAt: UPDATED },
      [feeds[`base:${USDC}`].proxy]: { answer: 100_000_000n, updatedAt: UPDATED },
    });
    const trigger = new ChainlinkTriggerPrice(reader, {
      now: () => new Date(NOW),
    });
    const print = await trigger.getPrint({
      chain: 'base',
      baseAsset: null,
      quoteAsset: USDC,
    });
    expect(print).toBeNull();
  });

  it('health reports down before any print and healthy after (pinned clock)', async () => {
    const feeds = CHAINLINK_FEEDS;
    const reader = stubReader({
      [feeds['base:native'].proxy]: { answer: 300_000_000_000n, updatedAt: UPDATED },
      [feeds[`base:${USDC}`].proxy]: { answer: 100_000_000n, updatedAt: UPDATED },
    });
    const trigger = new ChainlinkTriggerPrice(reader, {
      now: () => new Date(NOW),
    });
    expect(trigger.health().status).toBe('down');
    await trigger.getPrint({ chain: 'base', baseAsset: null, quoteAsset: USDC });
    const health = trigger.health();
    expect(health.status).toBe('healthy');
    expect(health.priceAgeSec).toBe(120);
    expect(health.source).toBe('chainlink');
  });
});
