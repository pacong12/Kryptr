import {
  BadRequestException,
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { err } from '@kryptr/shared-types';
import { DomainError } from './domain-error';

/**
 * Every error response leaves the api in ApiEnvelope shape:
 * domain rule violations keep their code/status, DTO validation becomes
 * `validation_error`, everything else degrades to `internal_error`.
 */
@Catch()
export class ApiEnvelopeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status(code: number): { json(body: unknown): void };
    }>();

    if (exception instanceof DomainError) {
      response
        .status(exception.httpStatus)
        .json(err({ code: exception.code, message: exception.message }));
      return;
    }

    if (exception instanceof BadRequestException) {
      const body = exception.getResponse() as
        string | { message?: string | string[] };
      const message =
        typeof body === 'string'
          ? body
          : Array.isArray(body.message)
            ? body.message.join('; ')
            : (body.message ?? 'Bad Request');
      response.status(400).json(
        err({
          code: 'validation_error',
          message,
          agentHint:
            'Request payload failed DTO validation; fix the fields listed in message.',
        }),
      );
      return;
    }

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(
        err({
          code: 'http_error',
          message: exception.message,
        }),
      );
      return;
    }

    const message =
      exception instanceof Error ? exception.message : 'Unexpected error';
    response.status(500).json(err({ code: 'internal_error', message }));
  }
}
