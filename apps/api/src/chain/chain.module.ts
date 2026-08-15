import { Module } from '@nestjs/common';
import { CHAIN_READER } from './chain-reader.port';
import { StaticMockChainReader } from './static-mock-chain.reader';

/**
 * Composition root for chain access. Wave 1 wires the static mock;
 * Wave 2 swaps the provider here without touching consumers.
 */
@Module({
  providers: [{ provide: CHAIN_READER, useClass: StaticMockChainReader }],
  exports: [CHAIN_READER],
})
export class ChainModule {}
