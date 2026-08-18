import { Injectable } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { AbiConsumerPort, ContractArtifact } from '../domain/abi-consumer.port';

/**
 * Filesystem-based ABI consumer
 * Reads compiled artifact files (e.g., contracts/shared/artifacts/TokenFactory.json)
 */
@Injectable()
export class FilesystemAbiConsumer implements AbiConsumerPort {
  private readonly artifactsPath: string;

  constructor() {
    // Look for artifacts in contracts directory relative to workspace root
    this.artifactsPath = join(__dirname, '../../../../../../contracts/shared/artifacts');
  }

  async loadArtifact(contractName: string): Promise<ContractArtifact | null> {
    const filePath = join(this.artifactsPath, `${contractName}.json`);

    if (!existsSync(filePath)) {
      console.warn(`ABI artifact not found: ${filePath}`);
      return null;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const artifact = JSON.parse(content) as unknown;

      if (!this.isContractArtifact(artifact)) {
        throw new Error(`Invalid artifact structure for ${contractName}`);
      }

      return {
        abi: artifact.abi || [],
        bytecode: artifact.bytecode,
        deployedBytecode: artifact.deployedBytecode || artifact.bytecode,
        address: artifact.address,
        chainId: artifact.networks?.['84532']?.address ? 84532 : undefined, // Base Sepolia
      };
    } catch (error) {
      console.error(`Failed to load artifact ${contractName}:`, error);
      return null;
    }
  }

  getFunction(artifact: ContractArtifact, functionName: string) {
    return artifact.abi.find(fragment => 
      fragment.type === 'function' && fragment.name === functionName
    ) || null;
  }

  validateArtifact(artifact: ContractArtifact, requiredMethods?: string[]): boolean {
    if (!artifact.abi || artifact.abi.length === 0) {
      console.error('Artifact has no ABI');
      return false;
    }

    if (requiredMethods && requiredMethods.length > 0) {
      const availableFunctions = artifact.abi
        .filter(f => f.type === 'function')
        .map(f => f.name);

      const missing = requiredMethods.filter(method => !availableFunctions.includes(method));
      if (missing.length > 0) {
        console.error(`Artifact missing required methods: ${missing.join(', ')}`);
        return false;
      }
    }

    return true;
  }

  private isContractArtifact(obj: unknown): obj is Record<string, unknown> {
    return typeof obj === 'object' && obj !== null && 'abi' in obj;
  }
}
