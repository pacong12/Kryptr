import { DomainError } from '../common/domain-error';
import type { ViemClientPort } from './viem-client.port';
import { ViemChainReader } from './viem-chain.reader';

const OWNER = '0x1111111111111111111111111111111111111111';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

function viemStub(
  overrides: Partial<Record<keyof ViemClientPort, jest.Mock>> = {},
): ViemClientPort {
  return {
    getNativeBalance: jest.fn().mockResolvedValue('4200000000000000000'),
    getTokenBalances: jest
      .fn()
      .mockResolvedValue([{ token: USDC, balance: '999000000' }]),
    lastBlockNumber: jest.fn().mockResolvedValue(1n),
    health: jest.fn(),
    chainHealth: jest.fn(),
    ...overrides,
  } as unknown as ViemClientPort;
}

describe('ViemChainReader (CHAIN_MODE=viem routing reader)', () => {
  it('reads base native balances through the viem seam', async () => {
    const reader = new ViemChainReader(viemStub());
    await expect(reader.getNativeBalance('base', OWNER)).resolves.toBe(
      '4200000000000000000',
    );
  });

  it('queries only known base tokens and merges on-chain balances with metadata', async () => {
    const viem = viemStub();
    const reader = new ViemChainReader(viem);
    await expect(reader.getTokenBalances('base', OWNER)).resolves.toEqual([
      {
        contractAddress: USDC,
        symbol: 'USDC',
        decimals: 6,
        amount: '999000000',
      },
    ]);
    expect(viem.getTokenBalances).toHaveBeenCalledWith(OWNER, [USDC]);
  });

  it('omits known tokens whose multicall reverted', async () => {
    const viem = viemStub({
      getTokenBalances: jest.fn().mockResolvedValue([]),
    });
    const reader = new ViemChainReader(viem);
    await expect(reader.getTokenBalances('base', OWNER)).resolves.toEqual([]);
  });

  it('maps base RPC failures to chain_unavailable/502', async () => {
    const viem = viemStub({
      getNativeBalance: jest.fn().mockRejectedValue(new Error('rpc down')),
      getTokenBalances: jest.fn().mockRejectedValue(new Error('rpc down')),
    });
    const reader = new ViemChainReader(viem);
    await expect(reader.getNativeBalance('base', OWNER)).rejects.toMatchObject({
      code: 'chain_unavailable',
      httpStatus: 502,
    });
    await expect(reader.getTokenBalances('base', OWNER)).rejects.toBeInstanceOf(
      DomainError,
    );
  });

  it('keeps Robinhood Chain on the static mock (wave 4 goes real)', async () => {
    const viem = viemStub();
    const reader = new ViemChainReader(viem);
    await expect(
      reader.getNativeBalance('robinhood-chain', OWNER),
    ).resolves.toBe('100000000000000000000'); // 100 native, static table
    const holdings = await reader.getTokenBalances('robinhood-chain', OWNER);
    expect(holdings.map((h) => h.symbol)).toEqual(['RHC']);
    expect(viem.getNativeBalance).not.toHaveBeenCalled();
    expect(viem.getTokenBalances).not.toHaveBeenCalled();
  });
});
