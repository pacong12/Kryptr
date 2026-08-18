import { Inject, InjectionToken } from '@nestjs/common';
import type { JsonFragment } from 'viem';

/**
 * Injection token for ABI Consumer
 */
export const ABICONSUMER_TOKEN = 'ABICONSUMER_TOKEN';

/**
 * Contract ABI artifact interface
 */
export interface ContractArtifact {
  abi: JsonFragment[];
  bytecode?: string;
  deployedBytecode?: string;
  address?: string;
  chainId?: number;
}

/**
 * Port for consuming contract ABIs from artifacts
 * Reads compiled artifact files (e.g., TokenFactory.json)
 */
export interface AbiConsumerPort {
  /**
   * Load ABI artifact from file path or embedded resource
   */
  loadArtifact(contractName: string): Promise<ContractArtifact | null>;

  /**
   * Get a specific function fragment from the ABI
   */
  getFunction(artifact: ContractArtifact, functionName: string): JsonFragment | null;

  /**
   * Validate ABI structure and required methods
   */
  validateArtifact(artifact: ContractArtifact, requiredMethods?: string[]): boolean;
}

/**
 * Helper to inject ABI consumer
 */
export function InjectAbiConsumer() {
  return Inject(ABICONSUMER_TOKEN);
}
