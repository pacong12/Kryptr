import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ok, type ApiEnvelope, type SwapQuote } from '@kryptr/shared-types';
import { RequestQuoteUseCase } from './application/request-quote.usecase';
import { GetQuoteUseCase } from './application/get-quote.usecase';
import { QuoteRequestDto } from './dto/quote-request.dto';

/**
 * Quote-first swap flow entrances: POST /quotes requests a (read-only,
 * unsigned) quote; GET /quotes/:id fetches a stored one. Execution
 * calldata is NEVER served here — only via the approved-intent preview
 * on the security side.
 */
@Controller('quotes')
export class TradingController {
  constructor(
    private readonly requestQuote: RequestQuoteUseCase,
    private readonly getQuote: GetQuoteUseCase,
  ) {}

  @Post()
  async create(@Body() body: QuoteRequestDto): Promise<ApiEnvelope<SwapQuote>> {
    return ok(await this.requestQuote.execute(body));
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ApiEnvelope<SwapQuote>> {
    return ok(await this.getQuote.execute(id));
  }
}
