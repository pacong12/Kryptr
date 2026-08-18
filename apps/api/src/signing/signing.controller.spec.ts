import { Test, type TestingModule } from '@nestjs/testing';
import type { SignRequest, UnsignedTxPreview } from '@kryptr/shared-types';
import { SigningController } from './signing.controller';
import { SigningService } from './application/signing.service';

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

describe('SigningController (envelope shape)', () => {
  let module: TestingModule;
  let controller: SigningController;
  let service: { requestSignature: jest.Mock; getSignRequest: jest.Mock };

  beforeAll(async () => {
    service = {
      requestSignature: jest.fn().mockResolvedValue(SIGN_REQUEST),
      getSignRequest: jest.fn().mockResolvedValue(SIGN_REQUEST),
    };
    module = await Test.createTestingModule({
      controllers: [SigningController],
      providers: [{ provide: SigningService, useValue: service }],
    }).compile();
    controller = module.get(SigningController);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service.requestSignature.mockResolvedValue(SIGN_REQUEST);
    service.getSignRequest.mockResolvedValue(SIGN_REQUEST);
  });

  afterAll(async () => {
    await module.close();
  });

  it('POST /signing/request returns ok envelope with SignRequest', async () => {
    const result = await controller.request({
      intentId: 'intent-1',
      chain: 'base',
      preview: PREVIEW,
    });

    expect(result).toEqual({ ok: true, data: SIGN_REQUEST, error: null });
    expect(service.requestSignature).toHaveBeenCalledWith(
      'intent-1',
      'base',
      PREVIEW,
    );
  });

  it('GET /signing/:id returns ok envelope when found', async () => {
    const result = await controller.getById('sr-intent-1');
    expect(result).toEqual({ ok: true, data: SIGN_REQUEST, error: null });
    expect(service.getSignRequest).toHaveBeenCalledWith('sr-intent-1');
  });

  it('GET /signing/:id throws DomainError 404 when not found', async () => {
    service.getSignRequest.mockResolvedValue(null);
    await expect(controller.getById('unknown')).rejects.toMatchObject({
      code: 'sign_request_not_found',
      httpStatus: 404,
    });
  });
});
