import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import type { AbiConsumerPort, ContractArtifact } from '../domain/abi-consumer.port';
import { TokenFactoryService } from './token-factory.service';
import { ABICONSUMER_TOKEN, InjectAbiConsumer } from '../domain/abi-consumer.port';

describe('TokenFactoryService', () => {
  let service: TokenFactoryService;
  let abiConsumerMock: Partial<AbiConsumerPort>;

  const mockArtifact: ContractArtifact = {
    abi: [
      { type: 'function', name: 'FACTORY_VERSION', stateMutability: 'view' },
      { type: 'function', name: 'bondAmount', stateMutability: 'view' },
      { type: 'function', name: 'deploySalt', stateMutability: 'nonpayable' },
      { type: 'function', name: 'predictTokenAddress', stateMutability: 'view' },
      { type: 'function', name: 'deployToken', stateMutability: 'nonpayable' },
    ],
    bytecode: '0x608060405234801561001057600080fd5b50',
    deployedBytecode: '0x608060405234801561001057600080fd5b50',
    address: '0x1234567890123456789012345678901234567890',
    chainId: 84532,
  };

  beforeEach(async () => {
    abiConsumerMock = {
      loadArtifact: jest.fn().mockResolvedValue(mockArtifact),
      validateArtifact: jest.fn().mockReturnValue(true),
      getFunction: jest.fn().mockReturnValue({ type: 'function', name: 'FACTORY_VERSION' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenFactoryService,
        { provide: ABICONSUMER_TOKEN, useValue: abiConsumerMock },
        // Mock Logger to avoid console output
        { provide: Logger, useValue: { log: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() } },
      ],
    }).compile();

    service = module.get(TokenFactoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize()', () => {
    it('should successfully load and validate TokenFactory ABI', async () => {
      const result = await service.initialize();
      
      expect(result).toBe(true);
      expect(abiConsumerMock.loadArtifact).toHaveBeenCalledWith('TokenFactory');
      expect(abiConsumerMock.validateArtifact).toHaveBeenCalled();
    });

    it('should return false when artifact loading fails', async () => {
      (abiConsumerMock.loadArtifact as jest.Mock).mockRejectedValue(new Error('File not found'));
      
      const result = await service.initialize();
      
      expect(result).toBe(false);
    });

    it('should return false when validation fails', async () => {
      (abiConsumerMock.validateArtifact as jest.Mock).mockReturnValue(false);
      
      const result = await service.initialize();
      
      expect(result).toBe(false);
    });

    it('should store artifact after successful initialization', async () => {
      await service.initialize();
      
      const artifact = service.getArtifact();
      expect(artifact).toEqual(mockArtifact);
    });
  });

  describe('predictTokenAddress()', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should predict CREATE2 address for given parameters', () => {
      const params = {
        deployer: '0x1234567890123456789012345678901234567890',
        salt: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        template: '0x9876543210987654321098765432109876543210',
      };

      const predicted = service.predictTokenAddress(params);

      expect(predicted).toBeDefined();
      expect(predicted).toMatch(/^0x[0-9a-f]{40}$/);
    });

    it('should handle invalid parameters gracefully', () => {
      const result = service.predictTokenAddress({
        deployer: 'invalid',
        salt: 'invalid',
        template: 'invalid',
      });

      expect(result).toBeNull();
    });
  });

  describe('verifyArtifactIntegrity()', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return true when no expected hash provided', () => {
      const result = service.verifyArtifactIntegrity();
      expect(result).toBe(true);
    });

    it('should return true when hash matches', () => {
      const currentHash = '0x608060'; // First 10 chars of actual hash
      const result = service.verifyArtifactIntegrity(currentHash);
      expect(result).toBe(true);
    });

    it('should return false when hash does not match', () => {
      const result = service.verifyArtifactIntegrity('0x000000');
      expect(result).toBe(false);
    });
  });

  describe('generateDeploymentManifest()', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should generate valid deployment manifest', () => {
      const manifest = service.generateDeploymentManifest(
        '0x1111111111111111111111111111111111111111',
        '0xtxhash1234567890abcdef'
      );

      expect(manifest).toHaveProperty('contractName', 'KryptrLaunchToken');
      expect(manifest).toHaveProperty('version');
      expect(manifest).toHaveProperty('txHash', '0xtxhash1234567890abcdef');
      expect(manifest).toHaveProperty('address', '0x1111111111111111111111111111111111111111');
      expect(manifest).toHaveProperty('verified', true);
    });
  });

  describe('error handling', () => {
    it('should handle null artifact gracefully in predictTokenAddress', async () => {
      // Reset artifact to null by not initializing
      const testService = new TokenFactoryService(abiConsumerMock as AbiConsumerPort);
      
      const result = testService.predictTokenAddress({
        deployer: '0x1234',
        salt: '0xabcd',
        template: '0x9876',
      });

      expect(result).toBeNull();
    });
  });
});
