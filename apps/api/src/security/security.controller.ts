import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ok,
  type ApiEnvelope,
  type IntentTimelineStep,
  type SecurityDecision,
} from '@kryptr/shared-types';
import { EvaluateIntentUseCase } from './application/evaluate-intent.usecase';
import { GetIntentTimelineUseCase } from './application/get-intent-timeline.usecase';
import {
  PreviewSwapExecutionUseCase,
  type SwapExecutionPreview,
} from '../trading/application/preview-swap-execution.usecase';
import { EvaluateIntentDto } from './dto/evaluate-intent.dto';

/**
 * The gate's entrances. Evaluates a TransactionIntent against the
 * wallet's SecurityPolicy, serves the decision timeline, and — ONLY for
 * approved swap intents — an UNSIGNED execution preview. This module
 * never signs and never touches keys.
 */
@Controller('security')
export class SecurityController {
  constructor(
    private readonly evaluateIntent: EvaluateIntentUseCase,
    private readonly getIntentTimeline: GetIntentTimelineUseCase,
    private readonly previewSwapExecution: PreviewSwapExecutionUseCase,
  ) {}

  @Post('evaluate')
  async evaluate(
    @Body() body: EvaluateIntentDto,
  ): Promise<ApiEnvelope<SecurityDecision>> {
    return ok(await this.evaluateIntent.execute(body));
  }

  @Get('intents/:id/timeline')
  async timeline(
    @Param('id') id: string,
  ): Promise<ApiEnvelope<IntentTimelineStep[]>> {
    return ok(await this.getIntentTimeline.execute(id));
  }

  @Get('intents/:id/execution-preview')
  async executionPreview(
    @Param('id') id: string,
  ): Promise<ApiEnvelope<SwapExecutionPreview>> {
    return ok(await this.previewSwapExecution.execute(id));
  }
}
