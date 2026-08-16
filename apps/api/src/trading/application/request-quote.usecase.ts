import { Inject, Injectable } from '@nestjs/common';
import type { QuoteRequest, SwapQuote } from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from '../../wallet/domain/wallet-repository.port';
import {
  DEX_AGGREGATOR,
  type DexAggregatorPort,
} from '../domain/dex-aggregator.port';
import { QUOTE_STORE, type QuoteStore } from '../domain/quote-store.port';

const POSITIVE_DECIMAL = /^[1-9][0-9]*$/;

/** Applied when QuoteRequest.slippageBps is omitted. */
export const DEFAULT_SLIPPAGE_BPS = 50;
/**
 * Quote-first swap flow, step 1: validate the wallet/chain/amount, ask
 * the DexAggregatorPort for a quote, and persist it so the security gate
 * can bind it to exactly one intent later.
 */
@Injectable()
export class RequestQuoteUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepository,
    @Inject(DEX_AGGREGATOR) private readonly dex: DexAggregatorPort,
    @Inject(QUOTE_STORE) private readonly quoteStore: QuoteStore,
  ) {}

  async execute(request: QuoteRequest): Promise<SwapQuote> {
    const wallet = await this.walletRepository.findById(request.walletId);
    if (!wallet) {
      throw new DomainError(
        'wallet_not_found',
        `wallet "${request.walletId}" does not exist`,
        404,
      );
    }
    if (!wallet.chains.includes(request.chain)) {
      throw new DomainError(
        'chain_not_allowed',
        `chain "${request.chain}" is not enabled for wallet "${wallet.id}"`,
        422,
      );
    }
    if (!POSITIVE_DECIMAL.test(request.amount)) {
      throw new DomainError(
        'invalid_amount',
        'amount must be a positive decimal integer string (smallest unit)',
        422,
      );
    }

    const quote = await this.dex.getQuote({
      ...request,
      slippageBps: request.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
      taker: wallet.address,
    });
    await this.quoteStore.save(quote);
    return quote;
  }
}
