/**
 * LIVE chain reads against real Base RPC. OPT-IN, EXCLUDED from default CI.
 *
 *   npx nx run api:test:live
 *
 * Runs with CHAIN_MODE=viem: the ChainModule binds the real viem reader
 * (RPC_URL_BASE defaults to https://mainnet.base.org; public, no keys).
 * Assertions are shape-based (no hard-coded balances) so they survive chain
 * state changes; multicall3 is a permanent Base fixture.
 *
 * Flake policy: if public RPC rate-limits bite, re-run locally; this target
 * is never wired into the CI affected line.
 */
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../app/app.module';
import { CHAIN_READER } from '../chain/chain-reader.port';
import type { ChainReader } from '../chain/chain-reader.port';

// Permanent Base contract (safe fixture): native read always resolves;
// token holdings are read via the reader's multicall3 path.
const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11';

const WEI_STRING = /^\d+$/;

describe('live: Base chain reads via viem (public RPC, no keys)', () => {
  let app: INestApplication;
  let reader: ChainReader;

  beforeAll(async () => {
    // Env must be set BEFORE compile: bindings are chosen at wiring time.
    process.env.CHAIN_MODE = 'viem';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    reader = app.get(CHAIN_READER);
  });

  afterAll(async () => {
    delete process.env.CHAIN_MODE;
    await app.close();
  });

  it('reads native balance for a permanent address', async () => {
    const wei = await reader.getNativeBalance('base', MULTICALL3);
    expect(wei).toMatch(WEI_STRING);
  });

  it('reads token holdings via multicall3 (omit-reverts, never throws per-token)', async () => {
    const holdings = await reader.getTokenBalances('base', MULTICALL3);
    expect(Array.isArray(holdings)).toBe(true);
    // Shape-only: values move with chain state; a zero-balance owner may
    // yield empty or zero-amount entries — both prove the path executed.
    for (const h of holdings) {
      expect(h.contractAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(String(h.amount)).toMatch(WEI_STRING);
    }
  });
});
