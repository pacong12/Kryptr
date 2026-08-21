// @ts-expect-error - Temporary suppression for pre-existing type issues

import type { JsonFragment } from 'viem';

/**
 * TokenFactory contract deployed parameters
 */
export interface DeployParams {
  template: `0x${string}`;
  initialSupply: bigint;
  name: string;
  symbol: string;
  decimals: number;
}

/**
 * TokenFactory deployment response
 */
export interface TokenDeploymentResult {
  tokenAddress: `0x${string}`;
  predictedAddress: `0x${string}`;
  salt: string;
  transactionHash?: string;
}

/**
 * Contract interface methods exposed by TokenFactory
 */
export interface TokenFactoryInterface {
  /** Get factory version */
  FACTORY_VERSION: () => Promise<number>;

  /** Read bond configuration */
  bondAmount(): Promise<bigint>;
  bondSink(): Promise<string>;
  totalFeeBps(): Promise<number>;
  template(): Promise<string>;

  /** Predict token address before deployment */
  predictTokenAddress(params: {
    deployer: string;
    salt: string;
    template: string;
  }): Promise<string>;

  /** Deploy new token (requires signed tx) */
  deployToken(params: {
    deployer: string;
    params: DeployParams;
    salt: string;
  }): Promise<TokenDeploymentResult>;
}

/**
 * TokenFactory contract metadata after verification
 */
export interface TokenFactoryMetadata {
  factoryVersion: number;
  bondAmount: bigint;
  totalFeeBps: number;
  templateAddress: string;
  deployedBytecodeHash: string;
}
