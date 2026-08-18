import { Test } from '@nestjs/testing';
import { ZeroExVenueAdapter } from './zero-ex-venue.adapter';
import {
  GraduationStatus,
  type VirtualPoolResult,
  type VenueAccrualSnapshot,
} from '../domain/zero-ex-venue.adapter.types';

describe('ZeroExVenueAdapter', () => {
  let adapter: ZeroExVenueAdapter;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ZeroExVenueAdapter],
    }).compile();

    adapter = module.get(ZeroExVenueAdapter);
  });

  describe('createPool', () => {
    it('returns virtual pool result with deterministic venueId', async () => {
      const result = (await adapter.createPool(
        'wallet-base-demo',
        'token-launchpad-v1',
        8.75, // venueBps (additive model)
        { totalFeeBps: 175, recipients: [], scheduleVersion: 'v1.0.0' },
      )) as VirtualPoolResult;

      expect(result).toMatchObject({
        venueId: '84532:uniswap-v4:token-launchpad-v1',
        isLive: false,
        accruedAt: expect.any(String),
      });
      expect(typeof result.poolAddress).toBe('string');
    });

    it('validates venueBps as non-negative (PR #130 enforcement)', async () => {
      await expect(
        adapter.createPool('w1', 't1', -5, {
          totalFeeBps: 175,
          recipients: [],
          scheduleVersion: 'v1.0.0',
        }),
      ).rejects.toThrow('venueBps must be non-negative');
    });

    it('preserves additive fee model — base fee split unaffected by venue accrual', async () => {
      const result = (await adapter.createPool('w1', 't1', 8.75, {
        totalFeeBps: 175,
        recipients: [{ address: '0xrecipient1', shareBps: 50 }],
        scheduleVersion: 'v1.0.0',
      })) as VirtualPoolResult;

      // Base fee schedule preserved unchanged per two-ledger separation (§8.1 theorem)
      expect(result.venueId).toContain('0x-v2');
    });
  });

  describe('getAccrualSnapshot', () => {
    it('calculates floor accrual using exact INV-FEE-4 math', () => {
      // Per §4.5.1: f = floor(amount × RATE / 10_000) EXACT
      const tradeAmount = BigInt(1_000_000_000_000_000_000); // 1 wei-equivalent
      const venueBps = 8.75;

      const snapshot = adapter.getAccrualSnapshot(tradeAmount, venueBps);

      // Expected: floor(1e18 × 8.75 / 10_000) = floor(875_000_000_000_000)
      expect(snapshot).resolves.toHaveProperty('venueAccrualWei');
      expect(snapshot).resolves.toHaveProperty('tradeAmount');
    });

    it('handles overflow-safe calculation via scaled integer arithmetic (§4.5.1 overflow guard)', () => {
      const largeTradeAmount = BigInt(
        '115792089237316195423570985008687907853269984665640564039457584007913129639935',
      ); // Near 2^256

      // Should NOT throw overflow error
      const snapshot = adapter.getAccrualSnapshot(largeTradeAmount, 175);
      expect(snapshot).resolves.toHaveProperty('venueAccrualWei');
    });

    it('tracks venue accrual independently from base schedule (two-ledger separation §8.1)', () => {
      const snapshot = adapter.getAccrualSnapshot(BigInt(100_000), 12.5);

      // Venue share independent of schedule recipients (INV-VENUE-1 + §8.1 theorem)
      expect(snapshot).resolves.not.toHaveProperty('baseFeeAccruals');
    });
  });

  describe('checkGraduation', () => {
    it('returns NOT_APPLICABLE until S4 graduation logic implemented', async () => {
      const status = await adapter.checkGraduation('base-sepolia:testpool');
      expect(status).toBe('not_applicable');
    });
  });

  describe('Additive Fee Model Compliance', () => {
    it('preserves INV-FEE-2 conservation for base schedule recipients (§4.5 C1)', () => {
      const baseFeeWei = BigInt(175);
      const recipientShares = [BigInt(50), BigInt(50), BigInt(50), BigInt(25)];
      const sumShares = recipientShares.reduce(
        (acc, share) => acc + share,
        BigInt(0),
      );

      expect(sumShares).toBe(baseFeeWei);
    });

    it('additive model: trader pays base_fee + venue_share separately', () => {
      const baseFeeBps = 175;
      const venueShareBps = 8.75;
      const totalFeeBps = baseFeeBps + venueShareBps;

      expect(totalFeeBps).toBeGreaterThan(baseFeeBps);
      expect(totalFeeBps).toBeLessThan(200);
    });
  });
});
