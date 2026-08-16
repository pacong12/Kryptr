import type {
  DeployContext,
  SecurityPolicy,
  TransactionIntent,
  VerificationArtifactRef,
} from '@kryptr/shared-types';
import type {
  DecisionAudit,
  DeployAllowlistPort,
  IntentStore,
  PriceFeedPort,
  SecurityPolicyProvider,
  SpendLedger,
} from './ports';
import type { QuoteStore } from '../../trading/domain/quote-store.port';
import type { VerificationArtifactStore } from '../../launchpad/domain/verification-store.port';
import { EvaluateIntentUseCase } from './evaluate-intent.usecase';

/**
 * Wave-5 firewall layer-3 verification (vault design doc §1): the
 * EXECUTABLE statement that policy cannot override the automation-deploy
 * prohibition, and that no non-interactive origin ever gets deploy
 * auto-approval (Q4 ruling — unconditional, PERMANENT).
 *
 * These scenarios deliberately configure the MOST PERMISSIVE policy
 * imaginable (origin allowlisted, threshold/cap wide open) and a fully
 * allowlisted factory — the firewall must still hold.
 */

const FACTORY = '0xaaaa000000000000000000000000000000000001' as `0x${string}`;

const ARTIFACT: VerificationArtifactRef = {
  id: 't21:factory-base:v1',
  hash: '0xdeadbeef',
  claims: [
    { claim: 'admin_key_free', verifiedAt: '2026-08-01T00:00:00.000Z' },
    { claim: 'non_upgradeable', verifiedAt: '2026-08-01T00:00:00.000Z' },
  ],
};

const VALID_DEPLOY: DeployContext = {
  tokenName: 'Firewall Probe Token',
  tokenSymbol: 'FWP1',
  totalSupply: '1000000',
  factory: FACTORY,
  feeSchedule: {
    creatorShare: 0.007,
    lpShare: 0.005,
    protocolShare: 0.0049,
    buybackShare: 0.0006,
  },
  feeBps: { creator: 70, lp: 50, protocol: 49, buyback: 6 },
  feeRecipients: {
    creator: '0x1111111111111111111111111111111111111111',
    lp: '0x2222222222222222222222222222222222222222',
    protocol: '0x3333333333333333333333333333333333333333',
    buyback: '0x4444444444444444444444444444444444444444',
  },
  bondPaid: true,
  verification: ARTIFACT,
};

/** The most permissive policy imaginable — the firewall must ignore it. */
const PERMISSIVE_POLICY: SecurityPolicy = {
  walletId: 'wallet-1',
  allowedOrigins: [
    'user',
    'agent:trader-1',
    'automation:order-worker',
    'automation:anything',
  ],
  approvalThresholdUsd: Number.MAX_SAFE_INTEGER,
  dailyCapUsd: Number.MAX_SAFE_INTEGER,
  allowedChains: ['base'],
  rejectEncodedPayloads: false,
};

function deployIntent(origin: string, id: string): TransactionIntent {
  return {
    id,
    walletId: 'wallet-1',
    chain: 'base',
    kind: 'deploy',
    to: FACTORY,
    asset: null,
    amount: '0',
    origin,
    createdAt: '2026-08-16T00:00:00.000Z',
    deploy: { ...VALID_DEPLOY },
  };
}

function makeGate() {
  const priceFeed: jest.Mocked<PriceFeedPort> = {
    getSpotPrice: jest.fn().mockResolvedValue(3000),
    getUsdValue: jest.fn().mockResolvedValue(0),
    health: jest.fn(),
  };
  const spendLedger: jest.Mocked<SpendLedger> = {
    getSpentUsdToday: jest.fn().mockResolvedValue(0),
    record: jest.fn().mockResolvedValue(undefined),
  };
  const policyProvider: jest.Mocked<SecurityPolicyProvider> = {
    getPolicyForWallet: jest.fn().mockResolvedValue(PERMISSIVE_POLICY),
    upsert: jest.fn().mockResolvedValue(undefined),
  };
  const intentStore: jest.Mocked<IntentStore> = {
    save: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(null),
  };
  const decisionAudit: jest.Mocked<DecisionAudit> = {
    append: jest
      .fn()
      .mockImplementation((entry) =>
        Promise.resolve({ id: 'audit-1', ...entry }),
      ),
    findByIntentId: jest.fn().mockResolvedValue([]),
    appendSignEvent: jest.fn(),
    findSignEventsByIntentId: jest.fn().mockResolvedValue([]),
  };
  const quoteStore: jest.Mocked<QuoteStore> = {
    save: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(null),
    bind: jest.fn().mockResolvedValue(true),
  };
  const deployAllowlist: jest.Mocked<DeployAllowlistPort> = {
    // Fully allowlisted factory pinned to the fixture release — the
    // firewall must ignore the allowlist posture entirely anyway.
    isAllowed: jest.fn().mockReturnValue(true),
    verificationIdFor: jest.fn().mockReturnValue(ARTIFACT.id),
  };
  const verificationStore: jest.Mocked<VerificationArtifactStore> = {
    get: jest.fn().mockResolvedValue(ARTIFACT),
    put: jest.fn().mockResolvedValue(undefined),
  };
  return {
    gate: new EvaluateIntentUseCase(
      priceFeed,
      spendLedger,
      policyProvider,
      intentStore,
      decisionAudit,
      quoteStore,
      deployAllowlist,
      verificationStore,
    ),
    policyProvider,
    deployAllowlist,
  };
}

describe('wave-5 firewall layer-3 verification', () => {
  it('gate spec: policy CANNOT override the automation-deploy prohibition', async () => {
    const { gate, policyProvider, deployAllowlist } = makeGate();
    const decision = await gate.execute(
      deployIntent('automation:order-worker', 'fw-1'),
    );
    expect(decision.result).toBe('rejected');
    expect(decision.reason).toBe('automation_deploy_forbidden');
    // The rejection happened BELOW the policy layer: despite the origin
    // being explicitly allowlisted, the policy was never even read.
    expect(policyProvider.getPolicyForWallet).not.toHaveBeenCalled();
    expect(deployAllowlist.isAllowed).not.toHaveBeenCalled();
  });

  it('gate spec: synthetic automation origins cannot smuggle deploys', async () => {
    const { gate } = makeGate();
    const decision = await gate.execute(
      deployIntent('automation:totally-new-worker', 'fw-2'),
    );
    expect(decision.result).toBe('rejected');
    expect(decision.reason).toBe('automation_deploy_forbidden');
  });

  it('Q4 permanence: NO non-interactive origin class ever gets deploy auto-approval', async () => {
    const { gate } = makeGate();
    const nonInteractiveOrigins = [
      'automation:order-worker',
      'automation:anything',
      'agent:trader-1',
      'agent:some-other-agent',
    ];
    for (const origin of nonInteractiveOrigins) {
      const decision = await gate.execute(
        deployIntent(origin, `fw-permanence-${origin}`),
      );
      // Automation is hard-rejected (L1); agents escalate to HITL after
      // preconditions — neither EVER produces 'approved'.
      expect(decision.result).not.toBe('approved');
    }
  });

  it('regression: interactive deploys still escalate to HITL (wave-3 behavior preserved)', async () => {
    const { gate } = makeGate();
    const decision = await gate.execute(deployIntent('user', 'fw-user'));
    expect(decision.result).toBe('needs_human_approval');
    expect(decision.reason).toBe('deploy_requires_human_approval');
  });

  it('agents escalate to HITL with a fully valid context (unconditional, never approvable by policy)', async () => {
    const { gate } = makeGate();
    const decision = await gate.execute(
      deployIntent('agent:trader-1', 'fw-agent'),
    );
    expect(decision.result).toBe('needs_human_approval');
    expect(decision.reason).toBe('deploy_requires_human_approval');
  });
});
