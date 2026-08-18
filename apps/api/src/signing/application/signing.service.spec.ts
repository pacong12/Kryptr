import type { SignRequest, UnsignedTxPreview } from '@kryptr/shared-types';
import type { SignerPort } from '../domain/signer.port';
import type { SignRequestStore } from '../domain/sign-request-store.port';
import { SigningService } from './signing.service';

const PREVIEW: UnsignedTxPreview = {
  to: '0x1111111111111111111111111111111111111111',
  data: '0xdeadbeef',
  value: '0x0',
};

const SIGN_REQUEST: SignRequest = {
  id: 'sr-intent-1',
  intentId: 'intent-1',
  status: 'dry_run',
  unsignedTx: PREVIEW,
  digest: '0xabc',
  note: 'dry-run only — nothing broadcast',
  createdAt: '2026-05-01T00:00:00.000Z',
};

describe('SigningService', () => {
  let signer: jest.Mocked<SignerPort>;
  let store: jest.Mocked<SignRequestStore>;
  let service: SigningService;

  beforeEach(() => {
    signer = {
      requestSignature: jest.fn().mockResolvedValue(SIGN_REQUEST),
      getStatus: jest.fn(),
    };
    store = {
      createIfAbsent: jest.fn().mockResolvedValue(SIGN_REQUEST),
      findById: jest.fn().mockResolvedValue(null),
      findByIntentId: jest.fn().mockResolvedValue(null),
      markStatus: jest.fn(),
    };
    service = new SigningService(signer, store);
  });

  describe('requestSignature', () => {
    it('happy path: calls signer then store, returns stored request', async () => {
      const result = await service.requestSignature('intent-1', 'base', PREVIEW);

      expect(signer.requestSignature).toHaveBeenCalledWith({
        intentId: 'intent-1',
        chain: 'base',
        preview: PREVIEW,
      });
      expect(store.createIfAbsent).toHaveBeenCalledWith(SIGN_REQUEST);
      expect(result).toBe(SIGN_REQUEST);
    });

    it('fail-closed: throws when store returns null (duplicate intentId)', async () => {
      store.createIfAbsent.mockResolvedValue(null);

      await expect(
        service.requestSignature('intent-1', 'base', PREVIEW),
      ).rejects.toThrow('intent already bound to another sign request');
    });
  });

  describe('getSignRequest', () => {
    it('returns result from findByIntentId when found', async () => {
      store.findByIntentId.mockResolvedValue(SIGN_REQUEST);

      const result = await service.getSignRequest('intent-1');

      expect(result).toBe(SIGN_REQUEST);
      expect(store.findByIntentId).toHaveBeenCalledWith('intent-1');
      expect(store.findById).not.toHaveBeenCalled();
    });

    it('falls back to findById when findByIntentId returns null', async () => {
      store.findByIntentId.mockResolvedValue(null);
      store.findById.mockResolvedValue(SIGN_REQUEST);

      const result = await service.getSignRequest('sr-intent-1');

      expect(store.findById).toHaveBeenCalledWith('sr-intent-1');
      expect(result).toBe(SIGN_REQUEST);
    });

    it('returns null when neither store method finds a match', async () => {
      store.findByIntentId.mockResolvedValue(null);
      store.findById.mockResolvedValue(null);

      expect(await service.getSignRequest('unknown')).toBeNull();
    });
  });
});
