import type { SwapQuote } from '@kryptr/shared-types';
import type { QuoteStore } from '../domain/quote-store.port';
import { GetQuoteUseCase } from './get-quote.usecase';

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

describe('GetQuoteUseCase', () => {
  it('returns a stored quote', async () => {
    const quoteStore: jest.Mocked<QuoteStore> = {
      save: jest.fn(),
      findById: jest
        .fn()
        .mockResolvedValue({ quote: QUOTE, boundIntentId: null }),
      bind: jest.fn(),
    };
    const useCase = new GetQuoteUseCase(quoteStore);
    await expect(useCase.execute('quote-1')).resolves.toEqual(QUOTE);
  });

  it('raises a 404 domain error for unknown quotes', async () => {
    const quoteStore: jest.Mocked<QuoteStore> = {
      save: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
      bind: jest.fn(),
    };
    const useCase = new GetQuoteUseCase(quoteStore);
    await expect(useCase.execute('nope')).rejects.toMatchObject({
      code: 'quote_not_found',
      httpStatus: 404,
    });
  });
});
