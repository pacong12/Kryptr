import { Body, Controller, Post } from '@nestjs/common';
import {
  ok,
  type ApiEnvelope,
  type SecurityDecision,
} from '@kryptr/shared-types';
import { EvaluateIntentUseCase } from './application/evaluate-intent.usecase';
import { EvaluateIntentDto } from './dto/evaluate-intent.dto';

/**
 * The gate's only entrance. Evaluates a TransactionIntent against the
 * wallet's SecurityPolicy; signing (Wave 2) is a separate gated step that
 * consumes the resulting SecurityDecision. This module never signs and
 * never touches keys.
 */
@Controller('security')
export class SecurityController {
  constructor(private readonly evaluateIntent: EvaluateIntentUseCase) {}

  @Post('evaluate')
  async evaluate(
    @Body() body: EvaluateIntentDto,
  ): Promise<ApiEnvelope<SecurityDecision>> {
    return ok(await this.evaluateIntent.execute(body));
  }
}
