import { DomainError } from '../../common/domain-error';

export class InvalidAddressError extends DomainError {
  constructor(address: string) {
    super('invalid_address', `invalid wallet address "${address}"`);
  }
}

export class ChainNotAllowedError extends DomainError {
  constructor(chain: string) {
    super(
      'chain_not_allowed',
      `chain "${chain}" is not in the wallet chain allowlist`,
    );
  }
}

export class WalletExistsError extends DomainError {
  constructor(address: string) {
    super(
      'wallet_exists',
      `a wallet for address "${address}" already exists`,
      409,
    );
  }
}

export class WalletNotFoundError extends DomainError {
  constructor(id: string) {
    super('wallet_not_found', `wallet "${id}" was not found`, 404);
  }
}
