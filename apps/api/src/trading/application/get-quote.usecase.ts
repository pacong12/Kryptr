import { Inject, Injectable } from '@nestjs/common';
import type { SwapQuote } from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import { QUOTE_STORE, type QuoteStore } from '../domain/quote-store.port';

/** Fetch a previously requested quote by id (GET /quotes/:id). */
@Injectable()
export class GetQuoteUseCase {
  constructor(@Inject(QUOTE_STORE) private readonly quoteStore: QuoteStore) {}

  async execute(quoteId: string): Promise<SwapQuote> {
    const stored = await this.quoteStore.findById(quoteId);
    if (!stored) {
      throw new DomainError(
        'quote_not_found',
        `quote "${quoteId}" does not exist`,
        404,
      );
    }
    return stored.quote;
  }
}
