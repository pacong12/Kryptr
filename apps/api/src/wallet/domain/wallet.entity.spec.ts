import type { ChainId } from '@kryptr/shared-types';
import {
  buildWallet,
  isValidAddress,
  walletIdFor,
  WALLET_ALLOWED_CHAINS,
} from './wallet.entity';
import { ChainNotAllowedError, InvalidAddressError } from './wallet.errors';

const VALID_ADDRESS = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B';

describe('wallet domain rules', () => {
  describe('isValidAddress', () => {
    it('accepts 0x-prefixed 40-hex-char addresses (any case)', () => {
      expect(isValidAddress(VALID_ADDRESS)).toBe(true);
      expect(isValidAddress(VALID_ADDRESS.toLowerCase())).toBe(true);
    });

    it('rejects malformed addresses', () => {
      expect(isValidAddress('Ab5801a7D398351b8bE11C439e05C5B3259aeC9B')).toBe(
        false,
      );
      expect(isValidAddress('0x123')).toBe(false);
      expect(isValidAddress(`0x${'z'.repeat(40)}`)).toBe(false);
      expect(isValidAddress('')).toBe(false);
    });
  });

  describe('chain allowlist', () => {
    it('is the phase-1 chain set', () => {
      expect([...WALLET_ALLOWED_CHAINS]).toEqual(['base', 'robinhood-chain']);
    });

    it('buildWallet accepts allowed chains and de-duplicates', () => {
      const wallet = buildWallet({
        ownerId: 'owner-1',
        address: VALID_ADDRESS as `0x${string}`,
        chains: ['base', 'robinhood-chain', 'base'],
      });
      expect(wallet.chains).toEqual(['base', 'robinhood-chain']);
    });

    it('buildWallet rejects chains outside the allowlist', () => {
      expect(() =>
        buildWallet({
          ownerId: 'owner-1',
          address: VALID_ADDRESS as `0x${string}`,
          chains: ['solana' as ChainId],
        }),
      ).toThrow(ChainNotAllowedError);
    });

    it('buildWallet rejects an empty chain set', () => {
      expect(() =>
        buildWallet({
          ownerId: 'owner-1',
          address: VALID_ADDRESS as `0x${string}`,
          chains: [],
        }),
      ).toThrow(ChainNotAllowedError);
    });
  });

  describe('buildWallet', () => {
    it('rejects invalid addresses', () => {
      expect(() =>
        buildWallet({
          ownerId: 'owner-1',
          address: '0x123' as `0x${string}`,
          chains: ['base'],
        }),
      ).toThrow(InvalidAddressError);
    });

    it('produces a well-formed AgentWallet', () => {
      const wallet = buildWallet({
        ownerId: 'owner-1',
        address: VALID_ADDRESS as `0x${string}`,
        chains: ['base'],
        now: new Date('2026-05-01T00:00:00.000Z'),
      });
      expect(wallet).toEqual({
        id: walletIdFor('owner-1', VALID_ADDRESS),
        address: VALID_ADDRESS,
        ownerId: 'owner-1',
        chains: ['base'],
        createdAt: '2026-05-01T00:00:00.000Z',
        lastKeyRotationAt: null,
      });
    });
  });

  describe('walletIdFor', () => {
    it('is deterministic', () => {
      expect(walletIdFor('owner-1', VALID_ADDRESS)).toBe(
        walletIdFor('owner-1', VALID_ADDRESS),
      );
    });

    it('is case-insensitive on the address', () => {
      expect(walletIdFor('owner-1', VALID_ADDRESS)).toBe(
        walletIdFor('owner-1', VALID_ADDRESS.toLowerCase()),
      );
    });

    it('differs per owner and never exposes the raw address', () => {
      const id = walletIdFor('owner-1', VALID_ADDRESS);
      expect(walletIdFor('owner-2', VALID_ADDRESS)).not.toBe(id);
      expect(id).not.toContain(VALID_ADDRESS.toLowerCase().slice(2));
    });
  });
});
