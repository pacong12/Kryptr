import { Module } from '@nestjs/common';
import { CHAIN_READER, ChainReader } from './chain-reader.port';
import { RealViemClient } from './real-viem.client';
import { StaticMockChainReader } from './static-mock-chain.reader';
import { StaticViemClient } from './static-viem.client';
import { VIEM_CLIENT, ViemClientPort } from './viem-client.port';
import { ViemChainReader } from './viem-chain.reader';

/**
 * Composition root for chain access. CHAIN_MODE selects the seam binding
 * at wiring time (process.env): 'static' (default) keeps the zero-network
 * stubs; 'viem' goes real on Base via RPC_URL_BASE with a PublicNode
 * fallback. Robinhood Chain stays static-mock until wave 4.
 */
@Module({
  providers: [
    {
      provide: VIEM_CLIENT,
      useFactory: (): ViemClientPort => {
        if (process.env.CHAIN_MODE === 'viem') {
          return RealViemClient.fromRpc({
            rpcUrl: process.env.RPC_URL_BASE || undefined,
          });
        }
        return new StaticViemClient();
      },
    },
    {
      provide: CHAIN_READER,
      inject: [VIEM_CLIENT],
      useFactory: (viem: ViemClientPort): ChainReader => {
        if (process.env.CHAIN_MODE === 'viem') {
          return new ViemChainReader(viem);
        }
        return new StaticMockChainReader();
      },
    },
  ],
  exports: [CHAIN_READER, VIEM_CLIENT],
})
export class ChainModule {}
