import type { AgentWallet, SwapQuote } from '@kryptr/shared-types';
import type { WalletRepository } from '../../wallet/domain/wallet-repository.port';
import type { DexAggregatorPort } from '../domain/dex-aggregator.port';
import type { QuoteStore } from '../domain/quote-store.port';
import { DomainError } from '../../common/domain-error';
import {
  DEFAULT_SLIPPAGE_BPS,
  RequestQuoteUseCase,
} from './request-quote.usecase';
import {
  baseQuoteRequest,
  USDC_BASE,
} from '../domain/dex-aggregator.contract.spec';

const WALLET: AgentWallet = {
  id: 'wallet-1',
  address: '0x2222222222222222222222222222222222222222',
  ownerId: 'owner-1',
  chains: ['base'],
  createdAt: '2026-05-01T00:00:00.000Z',
  lastKeyRotationAt: null,
};

const QUOTE: SwapQuote = {
  id: 'quote-1',
  source: 'static-mock',
  chain: 'base',
  assetIn: null,
  assetOut: USDC_BASE,
  amountIn: '1000000000000000000',
  amountOut: '3000000000',
  price: 3000,
  minAmountOut: '2985000000',
  slippageBps: 50,
  route: [{ venue: 'static-mock', assetIn: null, assetOut: USDC_BASE }],
  fetchedAt: '2026-05-01T00:00:00.000Z',
  expiresAt: '2026-05-01T00:01:00.000Z',
};

describe('RequestQuoteUseCase', () => {
  let walletRepository: jest.Mocked<WalletRepository>;
  let dex: jest.Mocked<DexAggregatorPort>;
  let quoteStore: jest.Mocked<QuoteStore>;
  let useCase: RequestQuoteUseCase;

  beforeEach(() => {
    walletRepository = {
      save: jest.fn(),
      findById: jest.fn().mockResolvedValue(WALLET),
      findByAddress: jest.fn(),
      findAll: jest.fn(),
    };
    dex = {
      getQuote: jest.fn().mockResolvedValue(QUOTE),
      buildSwapTx: jest.fn(),
      health: jest.fn(),
    };
    quoteStore = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      bind: jest.fn(),
    };
    useCase = new RequestQuoteUseCase(walletRepository, dex, quoteStore);
  });

  it('rejects unknown wallets', async () => {
    walletRepository.findById.mockResolvedValue(null);
    await expect(useCase.execute(baseQuoteRequest())).rejects.toMatchObject({
      code: 'wallet_not_found',
    });
  });

  it('rejects chains outside the wallet allowlist', async () => {
    await expect(
      useCase.execute(baseQuoteRequest({ chain: 'robinhood-chain' })),
    ).rejects.toMatchObject({ code: 'chain_not_allowed' });
    expect(dex.getQuote).not.toHaveBeenCalled();
  });

  it.each(['', 'abc', '0', '-5', '1.5'])(
    'rejects invalid amounts (%p)',
    async (amount) => {
      await expect(
        useCase.execute(baseQuoteRequest({ amount })),
      ).rejects.toMatchObject({ code: 'invalid_amount' });
      expect(dex.getQuote).not.toHaveBeenCalled();
    },
  );

  it('quotes through the aggregator and stores the quote', async () => {
    const quote = await useCase.execute(baseQuoteRequest());
    expect(dex.getQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: 'wallet-1',
        chain: 'base',
        taker: WALLET.address,
      }),
    );
    expect(quoteStore.save).toHaveBeenCalledWith(QUOTE);
    expect(quote).toEqual(QUOTE);
  });

  it('always resolves taker server-side (client taker is ignored)', async () => {
    await useCase.execute(
      baseQuoteRequest({ taker: '0x9999999999999999999999999999999999999999' }),
    );
    expect(dex.getQuote).toHaveBeenCalledWith(
      expect.objectContaining({ taker: WALLET.address }),
    );
  });

  it('applies the default slippage tolerance when omitted', async () => {
    const request = baseQuoteRequest();
    delete request.slippageBps;
    await useCase.execute(request);
    expect(dex.getQuote).toHaveBeenCalledWith(
      expect.objectContaining({ slippageBps: DEFAULT_SLIPPAGE_BPS }),
    );
  });

  it('propagates aggregator domain errors (no partial store)', async () => {
    dex.getQuote.mockRejectedValue(
      new DomainError('chain_not_supported', 'nope', 422),
    );
    await expect(useCase.execute(baseQuoteRequest())).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(quoteStore.save).not.toHaveBeenCalled();
  });
});
