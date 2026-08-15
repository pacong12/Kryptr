import { BadRequestException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { DomainError } from './domain-error';
import { ApiEnvelopeExceptionFilter } from './api-envelope.exception-filter';

function makeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status, json }) }),
  } as unknown as ArgumentsHost;
  return { json, status, host };
}

describe('ApiEnvelopeExceptionFilter', () => {
  const filter = new ApiEnvelopeExceptionFilter();

  it('maps DomainError to an err() envelope with its status and code', () => {
    const { json, status, host } = makeHost();
    filter.catch(new DomainError('wallet_not_found', 'nope', 404), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      ok: false,
      data: null,
      error: { code: 'wallet_not_found', message: 'nope' },
    });
  });

  it('maps validation failures to a 400 validation_error envelope', () => {
    const { json, status, host } = makeHost();
    filter.catch(
      new BadRequestException({
        message: ['ownerId must be a string', 'chains must not be empty'],
        error: 'Bad Request',
        statusCode: 400,
      }),
      host,
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        data: null,
        error: expect.objectContaining({
          code: 'validation_error',
          message: 'ownerId must be a string; chains must not be empty',
        }),
      }),
    );
  });

  it('maps unknown errors to a 500 internal_error envelope', () => {
    const { json, status, host } = makeHost();
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      ok: false,
      data: null,
      error: { code: 'internal_error', message: 'boom' },
    });
  });
});
