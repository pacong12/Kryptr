/**
 * Test Fixtures for Phase 1 E2E Testing
 * Provides realistic mock data for Transfer Intent lifecycle validation
 */

import type {
  TransactionIntent,
  SecurityDecision,
  WalletBalance,
  ChainId,
} from '@kryptr/shared-types';

/**
 * Test wallet fixtures
 */
export const TEST_WALLET_1 = {
  id: 'wallet-phase1-test-001',
  name: 'Phase 1 Test Wallet',
  address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e' as `0x${string}`,
  chains: ['ethereum', 'base'] as ChainId[],
  createdAt: new Date('2024-08-18T10:00:00Z'),
};

export const TEST_WALLET_2 = {
  id: 'wallet-phase1-test-002',
  name: 'Secondary Test Wallet',
  address: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918' as `0x${string}`,
  chains: ['base'] as ChainId[],
  createdAt: new Date('2024-08-18T10:05:00Z'),
};

/**
 * Realistic token balances for testing
 */
export const TEST_TOKEN_BALANCES: WalletBalance[] = [
  {
    walletId: TEST_WALLET_1.id,
    chain: 'ethereum',
    nativeBalance: '5000000000000000000', // 5 ETH
    tokens: [
      {
        address: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`,
        symbol: 'USDC',
        decimals: 6,
        balance: '10000000000', // 10,000 USDC
      },
      {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as `0x${string}`,
        symbol: 'USDT',
        decimals: 6,
        balance: '5000000000', // 5,000 USDT
      },
    ],
  },
  {
    walletId: TEST_WALLET_1.id,
    chain: 'base',
    nativeBalance: '2500000000000000000', // 2.5 ETH on Base
    tokens: [
      {
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54fA026678' as `0x${string}`,
        symbol: 'USDC',
        decimals: 6,
        balance: '5000000000', // 5,000 USDC
      },
    ],
  },
];

/**
 * Transfer intent fixtures
 */
export const createTestTransferIntent = (
  overrides?: Partial<TransactionIntent>
): Omit<TransactionIntent, 'id' | 'createdAt'> => ({
  kind: 'transfer',
  walletId: TEST_WALLET_1.id,
  origin: 'user',
  transfer: {
    assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`,
    amount: '1000000000', // 1,000 USDC
    recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918' as `0x${string}`,
    chain: 'ethereum' as ChainId,
    slippageBps: 50,
  },
  ...overrides,
});

export const CREATE_TRANSFER_INTENT_SMALL = createTestTransferIntent({
  walletId: TEST_WALLET_1.id,
  transfer: {
    ...createTestTransferIntent().transfer,
    amount: '100000000', // 100 USDC (small, should auto-approve)
  },
});

export const CREATE_TRANSFER_INTENT_LARGE = createTestTransferIntent({
  walletId: TEST_WALLET_1.id,
  transfer: {
    ...createTestTransferIntent().transfer,
    amount: '10000000000', // 10,000 USDC (large, requires approval)
  },
});

export const CREATE_DEPLOY_INTENT = {
  kind: 'deploy' as const,
  walletId: TEST_WALLET_1.id,
  origin: 'user',
  payload: '0xdeadbeef1234',
  encodedPayload: false,
};

export const AUTOMATION_DEPLOY_INTENT = {
  kind: 'deploy' as const,
  walletId: TEST_WALLET_1.id,
  origin: 'automation:test-worker',
  payload: '0xautomation',
};

/**
 * Mock API response structures
 */
export const MOCK_API_RESPONSES = {
  walletBalances: {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      walletId: TEST_WALLET_1.id,
      balances: TEST_TOKEN_BALANCES,
    },
  },

  intentSubmitted: {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
    body: {
      id: 'intent-phase1-test-001',
      status: 'submitted',
      kind: 'transfer',
      walletId: TEST_WALLET_1.id,
      origin: 'user',
      createdAt: new Date().toISOString(),
    },
  },

  intentApproved: {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      id: 'intent-phase1-test-001',
      decision: 'approved',
      reason: 'approved: within policy',
      valueUsd: 20.50,
      reservedSpendUsd: 20.50,
      approvedAt: new Date().toISOString(),
    },
  },

  intentNeedsApproval: {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      id: 'intent-phase1-test-002',
      decision: 'needs_human_approval',
      reason: 'needs_human_approval: value $1050.00 exceeds approval threshold $100.00',
      valueUsd: 1050.00,
      requiredHumanApproval: true,
    },
  },

  intentRejected: {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      id: 'intent-phase1-test-003',
      decision: 'rejected',
      reason: 'rejected: daily cap exceeded (value $500.00 does not fit under cap $1000.00)',
      valueUsd: 500.00,
    },
  },

  timelineCreated: {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      intentId: 'intent-phase1-test-001',
      steps: [
        {
          step: 'created',
          at: new Date().toISOString(),
          actor: 'user',
          detail: 'transfer intent received',
        },
      ],
    },
  },

  timelineWithDecisions: {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      intentId: 'intent-phase1-test-001',
      steps: [
        {
          step: 'created',
          at: new Date(Date.now() - 3600000).toISOString(),
          actor: 'user',
          detail: 'transfer intent received',
        },
        {
          step: 'gate_decision',
          at: new Date(Date.now() - 3540000).toISOString(),
          actor: 'gate',
          detail: 'approved: within policy',
        },
      ],
    },
  },

  securityFeeds: {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      feeds: [
        {
          feedId: 'dex:zero-ex',
          source: '0x',
          status: 'healthy',
          lastUpdateAt: new Date().toISOString(),
          priceAgeSec: 120,
        },
        {
          feedId: 'price:coingecko',
          source: 'coingecko',
          status: 'healthy',
          lastUpdateAt: new Date().toISOString(),
          priceAgeSec: 60,
        },
      ],
    },
  },
};

/**
 * Network failure simulation patterns
 */
export const NETWORK_FAILURE_PATTERNS = {
  timeout: () => Promise.reject(new Error('Network timeout')),
  serverError: () => Promise.reject({ status: 500, message: 'Internal Server Error' }),
  serviceUnavailable: () => Promise.reject({ status: 503, message: 'Service Unavailable' }),
  networkDown: () => {
    throw new Error('No network connection');
  },
};

/**
 * Intent state machine transitions
 */
export const INTENT_STATE_TRANSITIONS = {
  PENDING_SUBMISSION: 'pending_submission',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  EXECUTED: 'executed',
  FAILED: 'failed',
};

/**
 * Realistic scenario data for different test cases
 */
export const SCENARIO_DATA = {
  smallTransfer: {
    description: 'Small transfer within approval threshold',
    amount: '100000000', // 100 USDC
    expectedOutcome: 'APPROVED',
    valueUsd: 100,
  },

  mediumTransfer: {
    description: 'Medium transfer requiring human approval',
    amount: '1500000000', // 1,500 USDC
    expectedOutcome: 'NEEDS_APPROVAL',
    valueUsd: 1500,
  },

  largeTransfer: {
    description: 'Large transfer exceeding daily cap',
    amount: '10000000000', // 10,000 USDC
    expectedOutcome: 'REJECTED_CAP',
    valueUsd: 10000,
  },

  unauthorizedOrigin: {
    description: 'Intent from unauthorized automation origin',
    origin: 'automation:worker',
    kind: 'deploy' as const,
    expectedOutcome: 'REJECTED_AUTOMATION_DEPLOY',
  },

  invalidRecipient: {
    description: 'Transfer to non-checksummed address',
    recipient: '0xinvalid' as `0x${string}`,
    expectedOutcome: 'VALIDATION_ERROR',
  },

  insufficientBalance: {
    description: 'Transfer amount exceeds available balance',
    amount: '99999999999', // Larger than any test balance
    expectedOutcome: 'INSUFFICIENT_FUNDS',
  },
};

/**
 * Mock frontend component states
 */
export const MOCK_FRONTEND_STATES = {
  WALLET_DETAILS_LOADED: {
    isLoading: false,
    wallet: TEST_WALLET_1,
    balances: TEST_TOKEN_BALANCES,
    error: null,
  },

  WALLET_LOADING: {
    isLoading: true,
    wallet: null,
    balances: [],
    error: null,
  },

  WALLET_ERROR: {
    isLoading: false,
    wallet: null,
    balances: [],
    error: 'Failed to load wallet balances',
  },

  TRANSFORMER_READY: {
    mode: 'transfer',
    fromWallet: TEST_WALLET_1,
    toWallet: TEST_WALLET_2,
    selectedAsset: TEST_TOKEN_BALANCES[0].tokens[0],
    amount: '',
    isAmountValid: true,
  },

  TRANSFORMING_AMOUNT: {
    mode: 'transfer',
    fromWallet: TEST_WALLET_1,
    toWallet: TEST_WALLET_2,
    selectedAsset: TEST_TOKEN_BALANCES[0].tokens[0],
    amount: '1000',
    isAmountValid: false, // Amount too high
  },

  INTENT_CONFIRMATION_MODAL: {
    isOpen: true,
    intentData: CREATE_TRANSFER_INTENT_SMALL.transfer,
    estimatedValueUsd: 100,
    warningMessages: [],
  },

  BACKOFFICE_DASHBOARD_REFRESHING: {
    isRefreshing: true,
    lastRefresh: new Date(),
    pendingIntents: 5,
    activeIntents: 3,
  },
};

/**
 * Helper function to generate unique intent IDs
 */
export const generateIntentId = (): string => {
  return `intent-phase1-${Date.now()}-${Math.random().toString(36).substring(7)}`;
};

/**
 * Helper to simulate async delay
 */
export const delay = (ms: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
};

/**
 * Get ISO timestamp with optional offset
 */
export const isoTime = (offsetMs: number = 0): string => {
  return new Date(Date.now() + offsetMs).toISOString();
};

/**
 * Create batch of intents for stress testing
 */
export const createBatchIntents = (count: number): Array<Omit<TransactionIntent, 'id' | 'createdAt'>> => {
  return Array.from({ length: count }, (_, i) => ({
    kind: 'transfer',
    walletId: TEST_WALLET_1.id,
    origin: 'user',
    transfer: {
      assetIn: TEST_TOKEN_BALANCES[0].tokens[0].address,
      amount: '100000000', // 100 USDC each
      recipient: TEST_WALLET_2.address,
      chain: 'ethereum',
      slippageBps: 50,
    },
  }));
};
