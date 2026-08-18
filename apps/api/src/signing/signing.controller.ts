import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ok, type ApiEnvelope, type SignRequest } from '@kryptr/shared-types';
import type { ChainId, UnsignedTxPreview } from '@kryptr/shared-types';
import { SigningService } from './application/signing.service';
import { DomainError } from '../common/domain-error';

class RequestSignatureDto {
  intentId!: string;
  chain!: ChainId;
  preview!: UnsignedTxPreview;
}

/**
 * Thin signing controller — no business logic, delegates entirely to
 * SigningService. Fail-closed: 404 for unknown sign requests.
 */
@Controller('signing')
export class SigningController {
  constructor(private readonly signingService: SigningService) {}

  @Post('request')
  @HttpCode(201)
  async request(
    @Body() body: RequestSignatureDto,
  ): Promise<ApiEnvelope<SignRequest>> {
    return ok(
      await this.signingService.requestSignature(
        body.intentId,
        body.chain,
        body.preview,
      ),
    );
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<ApiEnvelope<SignRequest>> {
    const found = await this.signingService.getSignRequest(id);
    if (!found) {
      throw new DomainError('sign_request_not_found', `no sign request for id "${id}"`, 404);
    }
    return ok(found);
  }
}
