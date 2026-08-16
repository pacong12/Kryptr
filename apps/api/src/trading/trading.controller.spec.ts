import { Test, type TestingModule } from '@nestjs/testing';
import type { SwapQuote } from '@kryptr/shared-types';
import { TradingController } from './trading.controller';
import { RequestQuoteUseCase } from './application/request-quote.usecase';
import { GetQuoteUseCase } from './application/get-quote.usecase';
import type { QuoteRequestDto } from './dto/quote-request.dto';

const QUOTE: SwapQuote = {
  id: 'quote-1',
  source: 'static-mock',
  chain: 'base',
  assetIn: null,
  assetOut: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  amountIn: '1000',
  amountOut: '3000000',
  price: 3000,
  minAmountOut: '2985000',
  slippageBps: 50,
  route: [],
  fetchedAt: '2026-05-01T00:00:00.000Z',
  expiresAt: '2026-05-01T00:01:00.000Z',
};

const REQUEST: QuoteRequestDto = {
  walletId: 'wallet-1',
  chain: 'base',
  assetIn: null,
  assetOut: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  amount: '1000',
};

describe('TradingController (envelope shape)', () => {
  let module: TestingModule;
  let controller: TradingController;
  let requestQuote: { execute: jest.Mock };
  let getQuote: { execute: jest.Mock };

  beforeAll(async () => {
    requestQuote = { execute: jest.fn().mockResolvedValue(QUOTE) };
    getQuote = { execute: jest.fn().mockResolvedValue(QUOTE) };
    module = await Test.createTestingModule({
      controllers: [TradingController],
      providers: [
        { provide: RequestQuoteUseCase, useValue: requestQuote },
        { provide: GetQuoteUseCase, useValue: getQuote },
      ],
    }).compile();
    controller = module.get(TradingController);
  });

  afterAll(async () => {
    await module.close();
  });

  it('POST /quotes wraps the quote in an ok() envelope', async () => {
    await expect(controller.create(REQUEST)).resolves.toEqual({
      ok: true,
      data: QUOTE,
      error: null,
    });
    expect(requestQuote.execute).toHaveBeenCalledWith(REQUEST);
  });

  it('GET /quotes/:id wraps the stored quote in an ok() envelope', async () => {
    await expect(controller.findOne('quote-1')).resolves.toEqual({
      ok: true,
      data: QUOTE,
      error: null,
    });
    expect(getQuote.execute).toHaveBeenCalledWith('quote-1');
  });
});
