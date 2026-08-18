import { Inject, Injectable } from '@nestjs/common';
import type { ChainId, SignRequest, UnsignedTxPreview } from '@kryptr/shared-types';
import { SIGNER, type SignerPort } from '../domain/signer.port';
import { SIGN_REQUEST_STORE, type SignRequestStore } from '../domain/sign-request-store.port';

@Injectable()
export class SigningService {
  constructor(
    @Inject(SIGNER) private readonly signer: SignerPort,
    @Inject(SIGN_REQUEST_STORE) private readonly store: SignRequestStore,
  ) {}

  async requestSignature(
    intentId: string,
    chain: ChainId,
    preview: UnsignedTxPreview,
  ): Promise<SignRequest> {
    const signRequest = await this.signer.requestSignature({ intentId, chain, preview });

    const stored = await this.store.createIfAbsent(signRequest);
    if (stored === null) {
      throw new Error('intent already bound to another sign request');
    }

    return stored;
  }

  async getSignRequest(id: string): Promise<SignRequest | null> {
    return (await this.store.findByIntentId(id)) ?? this.store.findById(id);
  }
}
