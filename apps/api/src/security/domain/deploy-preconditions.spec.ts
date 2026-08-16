import type {
  DeployContext,
  TransactionIntent,
  VerificationArtifactRef,
  VerificationClaimKind,
} from '@kryptr/shared-types';
import {
  DEPLOY_REJECT_CODES,
  LAUNCH_TOTAL_FEE_BPS,
  validateDeployPreconditions,
} from './deploy-preconditions';

/**
 * Wave-5 deploy preconditions (§2.3 of the vault design doc). The gate
 * validates the consent-frozen DeployContext BEFORE signing; every
 * failure is a stable, DeckUI/FaceUI-mappable reject code.
 */

const FACTORY = '0xaaaa000000000000000000000000000000000001';
const RECIPIENTS = {
  creator: '0x1111111111111111111111111111111111111111',
  lp: '0x2222222222222222222222222222222222222222',
  protocol: '0x3333333333333333333333333333333333333333',
  buyback: '0x4444444444444444444444444444444444444444',
} as const;

const ARTIFACT: VerificationArtifactRef = {
  id: 't21:factory-base:v1',
  hash: '0xdeadbeef',
  claims: [
    { claim: 'admin_key_free', verifiedAt: '2026-08-01T00:00:00.000Z' },
    { claim: 'non_upgradeable', verifiedAt: '2026-08-01T00:00:00.000Z' },
  ],
};

/**
 * Valid fee mirrors sum to LAUNCH_TOTAL_FEE_BPS (175). Buyback
 * deliberately uses bps=6 / share=0.0006: 0.0006 * 10_000 is NOT === 6
 * under IEEE754 (Review54 F1 — 1149 of 9999 bps-derived shares break
 * literal equality), so this GREEN fixture would be red under literal
 * float comparison. Math.round is the only correct consistency check.
 */
const VALID_DEPLOY: DeployContext = {
  tokenName: 'Kryptr Test Token',
  tokenSymbol: 'KTT1',
  totalSupply: '1000000000000000000000000',
  factory: FACTORY as `0x${string}`,
  feeSchedule: {
    creatorShare: 0.007,
    lpShare: 0.005,
    protocolShare: 0.0049,
    buybackShare: 0.0006,
  },
  feeBps: { creator: 70, lp: 50, protocol: 49, buyback: 6 },
  feeRecipients: { ...RECIPIENTS },
  bondPaid: true,
  verification: ARTIFACT,
};

function deployIntent(
  overrides: Partial<Omit<TransactionIntent, 'deploy'>> = {},
  // null sentinel: explicitly NO deploy context (undefined would hit
  // the default parameter and re-materialize the valid context).
  deploy: DeployContext | null = { ...VALID_DEPLOY },
): TransactionIntent {
  return {
    id: 'intent-deploy-1',
    walletId: 'wallet-1',
    chain: 'base',
    kind: 'deploy',
    to: FACTORY as `0x${string}`,
    asset: null,
    amount: '0',
    origin: 'user',
    createdAt: '2026-08-16T00:00:00.000Z',
    deploy: deploy ?? undefined,
    ...overrides,
  };
}

const deps = {
  isFactoryAllowed: (chain: string, factory: string) =>
    chain === 'base' && factory.toLowerCase() === FACTORY,
  resolveVerification: async (id: string) =>
    id === ARTIFACT.id ? ARTIFACT : null,
};

describe('deploy preconditions (wave-5 gate table)', () => {
  it('freeze: DEPLOY_REJECT_CODES membership is stable (audit strings)', () => {
    expect([...DEPLOY_REJECT_CODES].sort()).toEqual(
      [
        'deploy_bond_unpaid',
        'deploy_context_invalid',
        'factory_mismatch',
        'factory_not_allowlisted',
        'fee_recipients_invalid',
        'fee_schedule_invalid',
        'verification_missing',
      ].sort(),
    );
  });

  it('accepts a fully valid context (null = escalate to HITL)', async () => {
    expect(await validateDeployPreconditions(deployIntent(), deps)).toBeNull();
  });

  it('compares factory/intent.to case-insensitively (checksum forms)', async () => {
    const intent = deployIntent({
      to: FACTORY.toUpperCase().replace('0X', '0x') as `0x${string}`,
    });
    expect(await validateDeployPreconditions(intent, deps)).toBeNull();
  });

  it('rejects a deploy intent with NO deploy context (fail-closed)', async () => {
    const intent = deployIntent({}, null);
    expect(await validateDeployPreconditions(intent, deps)).toBe(
      'deploy_context_invalid',
    );
  });

  it('rejects factory !== intent.to', async () => {
    const intent = deployIntent({
      to: '0xbbbb000000000000000000000000000000000002' as `0x${string}`,
    });
    expect(await validateDeployPreconditions(intent, deps)).toBe(
      'factory_mismatch',
    );
  });

  it('rejects null intent.to for deploys', async () => {
    expect(
      await validateDeployPreconditions(deployIntent({ to: null }), deps),
    ).toBe('factory_mismatch');
  });

  it('rejects a factory the allowlist does not carry', async () => {
    const otherFactory =
      '0xcccc000000000000000000000000000000000003' as `0x${string}`;
    const intent = deployIntent(
      { to: otherFactory },
      { ...VALID_DEPLOY, factory: otherFactory },
    );
    expect(await validateDeployPreconditions(intent, deps)).toBe(
      'factory_not_allowlisted',
    );
  });

  it('rejects bondPaid === false', async () => {
    const intent = deployIntent({}, { ...VALID_DEPLOY, bondPaid: false });
    expect(await validateDeployPreconditions(intent, deps)).toBe(
      'deploy_bond_unpaid',
    );
  });

  describe('token fields (FaceUI constraints)', () => {
    const bad: Array<[string, DeployContext]> = [
      ['empty name', { ...VALID_DEPLOY, tokenName: '' }],
      ['whitespace-only name', { ...VALID_DEPLOY, tokenName: '   ' }],
      ['name > 64 chars', { ...VALID_DEPLOY, tokenName: 'a'.repeat(65) }],
      ['control char in name', { ...VALID_DEPLOY, tokenName: 'Bad\u0007Name' }],
      ['non-ascii in name', { ...VALID_DEPLOY, tokenName: 'Bad\u00e9' }],
      ['empty symbol', { ...VALID_DEPLOY, tokenSymbol: '' }],
      ['lowercase symbol', { ...VALID_DEPLOY, tokenSymbol: 'ktt' }],
      ['symbol with space', { ...VALID_DEPLOY, tokenSymbol: 'KT T' }],
      ['symbol with underscore', { ...VALID_DEPLOY, tokenSymbol: 'KT_T' }],
      ['symbol > 12 chars', { ...VALID_DEPLOY, tokenSymbol: 'A'.repeat(13) }],
      ['totalSupply zero', { ...VALID_DEPLOY, totalSupply: '0' }],
      ['totalSupply negative', { ...VALID_DEPLOY, totalSupply: '-1' }],
      ['totalSupply non-integer', { ...VALID_DEPLOY, totalSupply: '1.5' }],
      ['totalSupply not numeric', { ...VALID_DEPLOY, totalSupply: '1e6' }],
    ];
    it.each(bad)('rejects %s', async (_label, deploy) => {
      expect(
        await validateDeployPreconditions(deployIntent({}, deploy), deps),
      ).toBe('deploy_context_invalid');
    });

    it('accepts boundary values (64-char name, 12-char symbol, supply 1)', async () => {
      const deploy: DeployContext = {
        ...VALID_DEPLOY,
        tokenName: 'a'.repeat(64),
        tokenSymbol: 'A'.repeat(12),
        totalSupply: '1',
      };
      expect(
        await validateDeployPreconditions(deployIntent({}, deploy), deps),
      ).toBeNull();
    });
  });

  describe('fee mirrors (Q1 ruling + Review54 F1)', () => {
    it('validates in PURE INTEGER arithmetic: sum equals launch total', async () => {
      const deploy: DeployContext = {
        ...VALID_DEPLOY,
        feeBps: { creator: 71, lp: 50, protocol: 49, buyback: 6 },
      };
      expect(
        await validateDeployPreconditions(deployIntent({}, deploy), deps),
      ).toBe('fee_schedule_invalid');
    });

    it('rejects negative bps', async () => {
      const deploy: DeployContext = {
        ...VALID_DEPLOY,
        feeBps: { creator: -6, lp: 50, protocol: 49, buyback: 6 },
      };
      expect(
        await validateDeployPreconditions(deployIntent({}, deploy), deps),
      ).toBe('fee_schedule_invalid');
    });

    it('rejects non-integer bps', async () => {
      const deploy: DeployContext = {
        ...VALID_DEPLOY,
        feeBps: { creator: 69.5, lp: 50, protocol: 49, buyback: 6.5 },
      };
      expect(
        await validateDeployPreconditions(deployIntent({}, deploy), deps),
      ).toBe('fee_schedule_invalid');
    });

    it('rejects mirror/share inconsistency beyond rounding', async () => {
      const deploy: DeployContext = {
        ...VALID_DEPLOY,
        feeSchedule: { ...VALID_DEPLOY.feeSchedule, creatorShare: 0.0071 },
      };
      expect(
        await validateDeployPreconditions(deployIntent({}, deploy), deps),
      ).toBe('fee_schedule_invalid');
    });

    it('accepts the IEEE754 trap via Math.round (0.0006 -> bps 6)', async () => {
      // 0.0006 * 10_000 !== 6 under IEEE754; literal equality would
      // reject this valid context. This is the executable F1 regression.
      expect(0.0006 * 10_000).not.toBe(6);
      expect(
        await validateDeployPreconditions(deployIntent(), deps),
      ).toBeNull();
    });

    it('rejects shares outside [0, 1]', async () => {
      const deploy: DeployContext = {
        ...VALID_DEPLOY,
        feeSchedule: { ...VALID_DEPLOY.feeSchedule, lpShare: 1.5 },
      };
      expect(
        await validateDeployPreconditions(deployIntent({}, deploy), deps),
      ).toBe('fee_schedule_invalid');
    });

    it('total fee bps is parameterized (reference 175)', () => {
      expect(LAUNCH_TOTAL_FEE_BPS).toBe(175);
    });
  });

  describe('recipients', () => {
    const invalidAddresses = [
      '0x123',
      'not-an-address',
      '',
      '0x' + 'g'.repeat(40),
    ];
    it.each(invalidAddresses)(
      'rejects invalid creator address %p',
      async (addr) => {
        const deploy: DeployContext = {
          ...VALID_DEPLOY,
          feeRecipients: { ...RECIPIENTS, creator: addr as `0x${string}` },
        };
        expect(
          await validateDeployPreconditions(deployIntent({}, deploy), deps),
        ).toBe('fee_recipients_invalid');
      },
    );
  });

  describe('verification artifact (T21, FaceUI flag)', () => {
    it('rejects missing verification for allowlisted factories', async () => {
      const deploy: DeployContext = {
        ...VALID_DEPLOY,
        verification: undefined,
      };
      expect(
        await validateDeployPreconditions(deployIntent({}, deploy), deps),
      ).toBe('verification_missing');
    });

    it('rejects empty claims', async () => {
      const deploy: DeployContext = {
        ...VALID_DEPLOY,
        verification: { ...ARTIFACT, claims: [] },
      };
      expect(
        await validateDeployPreconditions(deployIntent({}, deploy), deps),
      ).toBe('verification_missing');
    });

    it('rejects an artifact the canonical store does not know', async () => {
      const deploy: DeployContext = {
        ...VALID_DEPLOY,
        verification: { ...ARTIFACT, id: 't21:unknown' },
      };
      expect(
        await validateDeployPreconditions(deployIntent({}, deploy), deps),
      ).toBe('verification_missing');
    });

    it('rejects a hash mismatch against the canonical artifact', async () => {
      const deploy: DeployContext = {
        ...VALID_DEPLOY,
        verification: { ...ARTIFACT, hash: '0xtampered' },
      };
      expect(
        await validateDeployPreconditions(deployIntent({}, deploy), deps),
      ).toBe('verification_missing');
    });

    it('rejects claims outside the frozen vocabulary (Review54 N2)', async () => {
      // Wire payloads ignore TypeScript: the cast simulates a ref whose
      // claims fall outside VERIFICATION_CLAIMS. The gate rejects at the
      // source — the client-side filter is UX, not the security boundary.
      const deploy: DeployContext = {
        ...VALID_DEPLOY,
        verification: {
          ...ARTIFACT,
          claims: [
            {
              claim: 'unaudited_bonus' as unknown as VerificationClaimKind,
              verifiedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        },
      };
      expect(
        await validateDeployPreconditions(deployIntent({}, deploy), deps),
      ).toBe('verification_missing');
    });
  });
});
