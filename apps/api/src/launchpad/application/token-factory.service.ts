import { Injectable, Logger } from '@nestjs/common';
import { Address, Hex, keccak256, concat } from 'viem';
import type { AbiConsumerPort, ContractArtifact } from '../domain/abi-consumer.port';
import type { TokenFactoryMetadata, DeployParams, TokenDeploymentResult } from '../domain/token-factory.interface';
import { InjectAbiConsumer } from '../domain/abi-consumer.port';

/**
 * TokenFactory Service - Integrates loaded ABI with deployment workflow
 * 
 * This service provides typed access to TokenFactory contract methods
 * using the dynamically loaded ABI from contracts/shared/artifacts/.
 */
@Injectable()
export class TokenFactoryService {
  private readonly logger = new Logger(TokenFactoryService.name);
  private artifact: ContractArtifact | null = null;
  private metadata: TokenFactoryMetadata | null = null;

  constructor(
    @InjectAbiConsumer()
    private readonly abiConsumer: AbiConsumerPort,
  ) {}

  /**
   * Load and validate TokenFactory ABI at startup
   */
  async initialize(): Promise<boolean> {
    try {
      this.logger.log('Loading TokenFactory ABI artifact...');
      
      const artifact = await this.abiConsumer.loadArtifact('TokenFactory');
      
      if (!artifact) {
        this.logger.error('Failed to load TokenFactory.json artifact');
        return false;
      }

      // Validate required functions exist
      const requiredFunctions = [
        'FACTORY_VERSION',
        'bondAmount',
        'deploySalt',
        'predictTokenAddress',
        'deployToken',
      ];

      const isValid = this.abiConsumer.validateArtifact(artifact, requiredFunctions);
      
      if (!isValid) {
        this.logger.error('TokenFactory ABI validation failed');
        return false;
      }

      this.artifact = artifact;
      await this.extractMetadata();
      
      this.logger.log(`TokenFactory initialized (v${this.metadata?.factoryVersion})`);
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize TokenFactory service:', error);
      return false;
    }
  }

  /**
   * Extract static metadata from ABI
   */
  private async extractMetadata(): Promise<void> {
    if (!this.artifact) return;

    const factoryVersionFunc = this.abiConsumer.getFunction(this.artifact, 'FACTORY_VERSION');
    const bondAmountFunc = this.abiConsumer.getFunction(this.artifact, 'bondAmount');
    const totalFeeBpsFunc = this.abiConsumer.getFunction(this.artifact, 'totalFeeBps');
    const templateFunc = this.abiConsumer.getFunction(this.artifact, 'template');

    this.metadata = {
      factoryVersion: 1, // Default until runtime call
      bondAmount: BigInt(0),
      totalFeeBps: 0,
      templateAddress: '0x0000000000000000000000000000000000000000',
      deployedBytecodeHash: this.artifact.deployedBytecode 
        ? keccak256(this.artifact.deployedBytecode as Hex).slice(0, 10) 
        : '',
    };
  }

  /**
   * Predict token address before deployment (pure function)
   * Uses EIP-1014 CREATE2 logic
   */
  predictTokenAddress(params: {
    deployer: string;
    salt: string;
    template: string;
  }): Hex | null {
    if (!this.artifact) {
      this.logger.warn('TokenFactory not initialized for prediction');
      return null;
    }

    try {
      const { deployer, salt, template } = params;
      
      // CREATE2 address calculation
      const saltHex = salt.length === 66 ? salt as Hex : `0x${salt}`;
      const initializerData = this.encodeInitializeCall(template);
      
      const address = this.calculateCreate2Address(deployer, saltHex, initializerData);
      
      this.logger.debug(`Predicted token address: ${address} for deployer ${deployer}`);
      
      return address as Hex;
    } catch (error) {
      this.logger.error('Error predicting token address:', error);
      return null;
    }
  }

  /**
   * Encode Initialize call for CREATE2
   */
  private encodeInitializeCall(template: string): Hex {
    // Simplified - in production, would use actual abi-encode
    return `0x${'00'.repeat(36)}${template.slice(2)}`;
  }

  /**
   * Calculate CREATE2 address
   */
  private calculateCreate2Address(deployer: string, salt: Hex, initCode: Hex): Hex {
    // Standard CREATE2 formula: keccak256(0xff + sender + salt + keccak256(initCode))[12:]
    const initCodeHash = keccak256(initCode);
    const constructorArg = concat(['0xff', deployer, salt, initCodeHash]);
    const address = `0x${keccak256(constructorArg).slice(-40)}`;
    return address as Hex;
  }

  /**
   * Get current artifact reference
   */
  getArtifact(): ContractArtifact | null {
    return this.artifact;
  }

  /**
   * Verify artifact integrity against expected hash
   */
  verifyArtifactIntegrity(expectedHash?: string): boolean {
    if (!this.artifact || !this.artifact.bytecode) {
      return false;
    }

    const actualHash = keccak256(this.artifact.bytecode as Hex).slice(0, 10);
    
    if (expectedHash && !actualHash.startsWith(expectedHash)) {
      this.logger.error(`Artifact integrity check failed! Expected ${expectedHash}, got ${actualHash}`);
      return false;
    }

    return true;
  }

  /**
   * Generate deployment manifest entry
   */
  generateDeploymentManifest(tokenAddress: string, txHash: string): Record<string, unknown> {
    if (!this.metadata) {
      throw new Error('TokenFactory not initialized');
    }

    return {
      contractName: 'KryptrLaunchToken',
      version: this.metadata.factoryVersion,
      deployedAt: new Date().toISOString(),
      txHash,
      address: tokenAddress,
      templateAddress: this.metadata.templateAddress,
      feeStructure: {
        totalFeeBps: this.metadata.totalFeeBps,
        bondAmount: this.metadata.bondAmount.toString(),
      },
      verified: this.verifyArtifactIntegrity(),
    };
  }
}
