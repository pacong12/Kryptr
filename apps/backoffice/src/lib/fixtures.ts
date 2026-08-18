import type {
  AgentWallet,
  ChainReaderHealth,
  DeployContext,
  FeedHealth,
  IntentTimelineStep,
  KillSwitchAuditEntry,
  KillSwitchState,
  Order,
  OrderExecution,
  SecurityDecision,
  SignRequest,
  SwapQuote,
  TransactionIntent,
  TransactionStatus,
  WalletBalance,
  WorkerHealth,
} from '@kryptr/shared-types';

/**
 * Wave-1 fixture feed.
 *
 * The dashboard uses these whenever the API is unreachable (mock mode) and —
 * by design in wave 1 — for the recent-intents panel, because the vault
 * branch has not shipped an intents listing endpoint yet. Every fixture is
 * typed with the shared contracts; nothing here redeclares a shared shape.
 */

/** A TransactionIntent joined with the status of its execution lifecycle. */
export type IntentWithStatus = TransactionIntent & {
  status: TransactionStatus;
};

export const MOCK_WALLETS: AgentWallet[] = [
  {
    id: 'wal_base_treasury',
    address: '0x4a3f9c21d8b7e6a50c1d2e3f4a5b6c7d8e9f0a1b',
    ownerId: 'agent:face',
    chains: ['base'],
    createdAt: '2026-01-12T09:30:00.000Z',
    lastKeyRotationAt: '2026-02-01T09:30:00.000Z',
  },
  {
    id: 'wal_robinhood_settlement',
    address: '0x7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708',
    ownerId: 'agent:vault',
    chains: ['robinhood-chain'],
    createdAt: '2026-01-18T14:05:00.000Z',
    lastKeyRotationAt: null,
  },
  {
    id: 'wal_ops_gas_reserve',
    address: '0x1f2e3d4c5b6a798807060504030201f0e1d2c3b4',
    ownerId: 'automation:gas-top-up',
    chains: ['base', 'robinhood-chain'],
    createdAt: '2026-02-03T08:00:00.000Z',
    lastKeyRotationAt: '2026-02-17T08:00:00.000Z',
  },
];

export const MOCK_INTENTS: IntentWithStatus[] = [
  {
    id: 'int_9f3a',
    walletId: 'wal_base_treasury',
    chain: 'base',
    kind: 'transfer',
    to: '0x9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d',
    asset: null,
    amount: '250000000000000000',
    origin: 'agent:face',
    createdAt: '2026-02-19T11:42:00.000Z',
    status: 'pending_approval',
  },
  {
    id: 'int_7c1e',
    walletId: 'wal_robinhood_settlement',
    chain: 'robinhood-chain',
    kind: 'transfer',
    to: '0x0a1b2c3d4e5f60718293a4b5c6d7e8f901234567',
    asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    amount: '150000000',
    origin: 'user',
    createdAt: '2026-02-19T10:15:00.000Z',
    status: 'queued',
  },
  {
    id: 'int_5b8d',
    walletId: 'wal_ops_gas_reserve',
    chain: 'base',
    kind: 'transfer',
    to: '0x4a3f9c21d8b7e6a50c1d2e3f4a5b6c7d8e9f0a1b',
    asset: null,
    amount: '10000000000000000',
    origin: 'automation:gas-top-up',
    createdAt: '2026-02-19T06:00:00.000Z',
    status: 'confirmed',
  },
  {
    id: 'int_2e6f',
    walletId: 'wal_base_treasury',
    chain: 'base',
    kind: 'swap',
    to: null,
    asset: '0x4200000000000000000000000000000000000006',
    amount: '750000000000000000',
    origin: 'agent:face',
    swap: {
      quoteId: 'quo_2e6f_01',
      buyAsset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      minBuyAmount: '2424510000',
      maxSlippageBps: 100,
      quoteExpiresAt: '2026-02-18T16:53:00.000Z',
    },
    createdAt: '2026-02-18T16:48:00.000Z',
    status: 'rejected',
  },
  {
    id: 'int_0a4c',
    walletId: 'wal_robinhood_settlement',
    chain: 'robinhood-chain',
    kind: 'approve',
    to: '0x5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f',
    asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    amount: '0',
    origin: 'user',
    createdAt: '2026-02-18T09:20:00.000Z',
    status: 'failed',
  },
];

/**
 * Latest SecurityDecision per intent (wave-1 fixture). In later waves the
 * gate owns this state and deck fetches it from the vault API.
 */
export const MOCK_DECISIONS: Record<string, SecurityDecision> = {
  int_9f3a: {
    intentId: 'int_9f3a',
    result: 'needs_human_approval',
    reason: 'Value 250.00 USD exceeds approval threshold 100.00 USD.',
    decidedAt: '2026-02-19T11:42:07.000Z',
  },
  int_7c1e: {
    intentId: 'int_7c1e',
    result: 'approved',
    reason: 'All policy checks passed (origin, chain, threshold, daily cap).',
    decidedAt: '2026-02-19T10:15:03.000Z',
  },
  int_5b8d: {
    intentId: 'int_5b8d',
    result: 'approved',
    reason: 'Automation origin allowlisted; value under threshold.',
    decidedAt: '2026-02-19T06:00:02.000Z',
  },
  int_2e6f: {
    intentId: 'int_2e6f',
    result: 'rejected',
    reason: 'Daily cap exceeded: 1,250.00 USD > 1,000.00 USD cap.',
    decidedAt: '2026-02-18T16:48:11.000Z',
  },
  int_0a4c: {
    intentId: 'int_0a4c',
    result: 'rejected',
    reason: 'Encoded payload rejected at ingestion boundary.',
    decidedAt: '2026-02-18T09:20:05.000Z',
  },
};

/**
 * Wave-2 quote bound to the swap intent above (fixture for mock mode and
 * for the detail-page render when the API is unreachable).
 */
export const MOCK_QUOTES: Record<string, SwapQuote> = {
  quo_2e6f_01: {
    id: 'quo_2e6f_01',
    source: 'static-mock',
    chain: 'base',
    assetIn: '0x4200000000000000000000000000000000000006',
    assetOut: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    amountIn: '750000000000000000',
    amountOut: '2449000000',
    price: 3265.33,
    minAmountOut: '2424510000',
    fees: [{ asset: null, amount: '2100000000000000' }],
    slippageBps: 100,
    route: [
      {
        venue: 'uniswap-v3',
        assetIn: '0x4200000000000000000000000000000000000006',
        assetOut: '0x50c5725949a6f0c72e6c4a641f24049a917b0cbc',
        amountIn: '750000000000000000',
        amountOut: '2446551000000000000000',
      },
      {
        venue: 'aerodrome',
        assetIn: '0x50c5725949a6f0c72e6c4a641f24049a917b0cbc',
        assetOut: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        amountIn: '2446551000000000000000',
        amountOut: '2449000000',
      },
    ],
    fetchedAt: '2026-02-18T16:48:02.000Z',
    expiresAt: '2026-02-18T16:53:00.000Z',
  },
};

/** Per-intent lifecycle steps (fixture until the gate owns the timeline). */
export const MOCK_TIMELINES: Record<string, IntentTimelineStep[]> = {
  int_9f3a: [
    { step: 'created', at: '2026-02-19T11:42:00.000Z', actor: 'agent:face' },
    {
      step: 'gate_decision',
      at: '2026-02-19T11:42:07.000Z',
      actor: 'gate',
      detail: 'needs_human_approval — value above approval threshold',
    },
  ],
  int_7c1e: [
    { step: 'created', at: '2026-02-19T10:15:00.000Z', actor: 'user' },
    {
      step: 'gate_decision',
      at: '2026-02-19T10:15:03.000Z',
      actor: 'gate',
      detail: 'approved — all policy checks passed',
    },
    { step: 'queued', at: '2026-02-19T10:15:04.000Z', actor: 'system' },
  ],
  int_5b8d: [
    {
      step: 'created',
      at: '2026-02-19T06:00:00.000Z',
      actor: 'automation:gas-top-up',
    },
    {
      step: 'gate_decision',
      at: '2026-02-19T06:00:02.000Z',
      actor: 'gate',
      detail: 'approved — automation origin allowlisted',
    },
    { step: 'submitted', at: '2026-02-19T06:00:05.000Z', actor: 'system' },
    {
      step: 'confirmed',
      at: '2026-02-19T06:00:19.000Z',
      actor: 'system',
      detail: 'block 8841203',
    },
  ],
  int_2e6f: [
    { step: 'created', at: '2026-02-18T16:48:00.000Z', actor: 'agent:face' },
    {
      step: 'quoted',
      at: '2026-02-18T16:48:02.000Z',
      actor: 'aggregator:static-mock',
      detail: 'quote quo_2e6f_01 bound (expires 16:53 UTC)',
    },
    {
      step: 'gate_decision',
      at: '2026-02-18T16:48:11.000Z',
      actor: 'gate',
      detail: 'rejected — daily cap exceeded',
    },
  ],
  int_0a4c: [
    { step: 'created', at: '2026-02-18T09:20:00.000Z', actor: 'user' },
    {
      step: 'gate_decision',
      at: '2026-02-18T09:20:05.000Z',
      actor: 'gate',
      detail: 'rejected — encoded payload at ingestion boundary',
    },
    {
      step: 'failed',
      at: '2026-02-18T09:20:06.000Z',
      actor: 'system',
      detail: 'intent closed without signing',
    },
  ],
};

/**
 * Data-feed health fixtures — one per status
 * (healthy / stale / down / unconfigured).
 */
export const MOCK_FEEDS: FeedHealth[] = [
  {
    feedId: 'price:static',
    source: 'static',
    status: 'healthy',
    lastUpdateAt: '2026-02-19T11:41:55.000Z',
    priceAgeSec: 12,
  },
  {
    feedId: 'dex:static-mock',
    source: 'static-mock',
    status: 'stale',
    lastUpdateAt: '2026-02-19T11:36:40.000Z',
    priceAgeSec: 327,
  },
  {
    feedId: 'price:coingecko',
    source: 'coingecko',
    status: 'down',
    lastUpdateAt: null,
    priceAgeSec: null,
  },
  {
    feedId: 'dex:0x',
    source: '0x',
    status: 'unconfigured',
    lastUpdateAt: null,
    priceAgeSec: null,
  },
];

/** Chain-reader health fixtures — one reachable, one unreachable. */
export const MOCK_CHAINS: ChainReaderHealth[] = [
  {
    chainId: 'base',
    provider: 'viem:mainnet.base.org',
    reachable: true,
    blockHeight: 8841203,
    latencyMs: 46,
    lastBlockAt: '2026-02-19T11:41:58.000Z',
  },
  {
    chainId: 'robinhood-chain',
    provider: 'static-mock',
    reachable: false,
    blockHeight: null,
    latencyMs: null,
    lastBlockAt: null,
  },
];

/**
 * Per-wallet balances (mock mode for the wallet detail page).
 * wal_robinhood_settlement holds nothing -> empty-state demo.
 */
export const MOCK_BALANCES: Record<string, WalletBalance[]> = {
  wal_base_treasury: [
    {
      walletId: 'wal_base_treasury',
      chain: 'base',
      nativeBalance: '1200000000000000000',
      tokens: [
        {
          contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          symbol: 'USDC',
          decimals: 6,
          amount: '2449000000',
        },
        {
          contractAddress: '0x4200000000000000000000000000000000000006',
          symbol: 'WETH',
          decimals: 18,
          amount: '350000000000000000',
        },
      ],
    },
  ],
  wal_robinhood_settlement: [
    {
      walletId: 'wal_robinhood_settlement',
      chain: 'robinhood-chain',
      nativeBalance: '0',
      tokens: [],
    },
  ],
  wal_ops_gas_reserve: [
    {
      walletId: 'wal_ops_gas_reserve',
      chain: 'base',
      nativeBalance: '75000000000000000',
      tokens: [],
    },
    {
      walletId: 'wal_ops_gas_reserve',
      chain: 'robinhood-chain',
      nativeBalance: '0',
      tokens: [],
    },
  ],
};

/**
 * Wave-4 order-automation fixtures.
 *
 * These back the orders list, order detail + execution timeline, kill-switch
 * panel and worker-health card whenever the order-worker API is unreachable.
 * Statuses span the whole frozen ORDER_STATUSES union so every badge has a
 * rendered example.
 */

const BASE = 'base';
const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

export const MOCK_ORDERS: Order[] = [
  {
    id: 'ord_dca_treasury',
    walletId: 'wal_base_treasury',
    type: 'dca',
    status: 'open',
    chain: BASE,
    baseAsset: WETH,
    quoteAsset: USDC,
    side: 'buy',
    amount: '250000000000000000',
    limitPrice: null,
    interval: 'P1D',
    createdAt: '2026-08-12T08:00:00.000Z',
  },
  {
    id: 'ord_limit_gas',
    walletId: 'wal_ops_gas_reserve',
    type: 'limit',
    status: 'triggered',
    chain: BASE,
    baseAsset: WETH,
    quoteAsset: USDC,
    side: 'sell',
    amount: '100000000000000000',
    limitPrice: '3450.00',
    interval: null,
    createdAt: '2026-08-15T10:30:00.000Z',
  },
  {
    id: 'ord_limit_fill',
    walletId: 'wal_base_treasury',
    type: 'limit',
    status: 'filled',
    chain: BASE,
    baseAsset: USDC,
    quoteAsset: null,
    side: 'buy',
    amount: '1000000000',
    limitPrice: '0.9998',
    interval: null,
    createdAt: '2026-08-14T09:00:00.000Z',
  },
  {
    id: 'ord_dca_partial',
    walletId: 'wal_base_treasury',
    type: 'dca',
    status: 'partially_filled',
    chain: BASE,
    baseAsset: WETH,
    quoteAsset: USDC,
    side: 'buy',
    amount: '500000000000000000',
    limitPrice: null,
    interval: 'P1W',
    createdAt: '2026-08-01T12:00:00.000Z',
  },
  {
    id: 'ord_stop_pause',
    walletId: 'wal_ops_gas_reserve',
    type: 'stop',
    status: 'paused',
    chain: BASE,
    baseAsset: WETH,
    quoteAsset: USDC,
    side: 'sell',
    amount: '75000000000000000',
    limitPrice: '3000.00',
    interval: null,
    createdAt: '2026-08-10T16:45:00.000Z',
  },
  {
    id: 'ord_twap_reject',
    walletId: 'wal_base_treasury',
    type: 'twap',
    status: 'rejected',
    chain: BASE,
    baseAsset: WETH,
    quoteAsset: USDC,
    side: 'buy',
    amount: '300000000000000000',
    limitPrice: null,
    interval: 'PT1H',
    createdAt: '2026-08-16T07:20:00.000Z',
  },
  {
    id: 'ord_limit_cancel',
    walletId: 'wal_robinhood_settlement',
    type: 'limit',
    status: 'cancelled',
    chain: 'robinhood-chain',
    baseAsset: null,
    quoteAsset: null,
    side: 'sell',
    amount: '5000000000000000000',
    limitPrice: '1.02',
    interval: null,
    createdAt: '2026-08-08T11:00:00.000Z',
  },
  {
    id: 'ord_limit_expire',
    walletId: 'wal_ops_gas_reserve',
    type: 'limit',
    status: 'expired',
    chain: BASE,
    baseAsset: WETH,
    quoteAsset: USDC,
    side: 'buy',
    amount: '120000000000000000',
    limitPrice: '2800.00',
    interval: null,
    createdAt: '2026-08-05T14:10:00.000Z',
  },
  {
    id: 'ord_dca_fail',
    walletId: 'wal_base_treasury',
    type: 'dca',
    status: 'failed',
    chain: BASE,
    baseAsset: WETH,
    quoteAsset: USDC,
    side: 'buy',
    amount: '400000000000000000',
    limitPrice: null,
    interval: 'P1D',
    createdAt: '2026-08-11T06:30:00.000Z',
  },
  {
    id: 'ord_limit_pending',
    walletId: 'wal_base_treasury',
    type: 'limit',
    status: 'pending_approval',
    chain: BASE,
    baseAsset: WETH,
    quoteAsset: USDC,
    side: 'sell',
    amount: '900000000000000000',
    limitPrice: '3600.00',
    interval: null,
    createdAt: '2026-08-17T09:55:00.000Z',
  },
];

/**
 * Execution timelines keyed by order id. Each step mirrors the frozen
 * OrderExecution claim-store lifecycle (claimed → quoted → submitted →
 * confirmed / failed / cancelled / gate_rejected).
 */
export const MOCK_ORDER_EXECUTIONS: Record<string, OrderExecution[]> = {
  ord_limit_gas: [
    {
      id: 'ord_limit_gas:once',
      orderId: 'ord_limit_gas',
      slotKey: 'once',
      intentId: 'intent:ord_limit_gas:once',
      status: 'submitted',
      claimedAt: '2026-08-17T10:30:04.000Z',
      finishedAt: null,
      detail: 'Trigger price 3452.10 crossed limit 3450.00',
    },
  ],
  ord_limit_fill: [
    {
      id: 'ord_limit_fill:once',
      orderId: 'ord_limit_fill',
      slotKey: 'once',
      intentId: 'intent:ord_limit_fill:once',
      status: 'confirmed',
      claimedAt: '2026-08-14T09:00:06.000Z',
      finishedAt: '2026-08-14T09:00:31.000Z',
      detail: 'Filled at 0.9997; gate approved, 0x quote bound',
    },
  ],
  ord_dca_partial: [
    {
      id: 'ord_dca_partial:2026-08-08T00:00:00.000Z',
      orderId: 'ord_dca_partial',
      slotKey: '2026-08-08T00:00:00.000Z',
      intentId: 'intent:ord_dca_partial:2026-08-08T00:00:00.000Z',
      status: 'confirmed',
      claimedAt: '2026-08-08T00:00:05.000Z',
      finishedAt: '2026-08-08T00:00:29.000Z',
      detail: 'Weekly tranche filled',
    },
    {
      id: 'ord_dca_partial:2026-08-15T00:00:00.000Z',
      orderId: 'ord_dca_partial',
      slotKey: '2026-08-15T00:00:00.000Z',
      intentId: null,
      status: 'claimed',
      claimedAt: '2026-08-15T00:00:03.000Z',
      finishedAt: null,
      detail: 'Awaiting gate evaluation',
    },
  ],
  ord_dca_fail: [
    {
      id: 'ord_dca_fail:2026-08-11T00:00:00.000Z',
      orderId: 'ord_dca_fail',
      slotKey: '2026-08-11T00:00:00.000Z',
      intentId: null,
      status: 'failed',
      claimedAt: '2026-08-11T06:30:02.000Z',
      finishedAt: '2026-08-11T06:30:09.000Z',
      detail: 'quote_unavailable — aggregator returned no route',
    },
  ],
};

/** Kill-switch state is OFF by default; the audit trail shows prior flips. */
export const MOCK_KILL_SWITCH: KillSwitchState = {
  mode: 'off',
  activatedAt: null,
  reason: null,
};

/** Audited kill-switch mode changes — the frozen KillSwitchAuditEntry from
 * shared-types (moved there per wave-4 stage-B ruling; consumed verbatim). */

export const MOCK_KILL_SWITCH_AUDIT: KillSwitchAuditEntry[] = [
  {
    actor: 'backoffice:deck',
    at: '2026-08-10T09:12:00.000Z',
    from: 'cancel_active',
    to: 'off',
    reason: 'Oracle feed restored — resuming automation',
  },
  {
    actor: 'backoffice:deck',
    at: '2026-08-09T22:47:00.000Z',
    from: 'off',
    to: 'cancel_active',
    reason: 'Stale oracle feed — halt automation and cancel live orders',
  },
];

/** Worker health fixture — degraded on purpose to exercise the detail row. */
export const MOCK_WORKER_HEALTH: WorkerHealth = {
  component: 'order-worker',
  ok: false,
  detail: 'redis_unreachable',
  checkedAt: '2026-08-17T11:41:55.000Z',
};

/**
 * Wave-5 launch-request review fixtures.
 *
 * Deck-local shapes ONLY where shared-types has no contract yet:
 * `LaunchRequest` / `LaunchReviewStatus` / `FactoryHealth` are deck-local
 * until the deploy-gate branch lands its API contract — every frozen field
 * inside them (DeployContext, VerificationArtifactRef, FeeRecipients,
 * feeBps mirrors, TokenFeeSchedule) is consumed VERBATIM from
 * @kryptr/shared-types (gate #4 freeze, PR #62). Fee shares ↔ bps mirrors
 * satisfy the Q1 ruling: Math.round(share * 10_000) === bps.
 */

export const LAUNCH_REVIEW_STATUSES = [
  'pending_review',
  'approved',
  'rejected',
  'deployed',
] as const;
export type LaunchReviewStatus = (typeof LAUNCH_REVIEW_STATUSES)[number];

/** One launch request awaiting (or carrying) an operator deploy decision. */
export interface LaunchRequest {
  id: string;
  status: LaunchReviewStatus;
  chain: string;
  requestedBy: string;
  requestedAt: string;
  /** Frozen wave-5 contract — present for every deploy-kind request. */
  context: DeployContext;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionReason: string | null;
}

const LAUNCH_FACTORY = '0xfac70dea1111feed2222cafe3333babe4444d00d';

const FEE_RECIPIENTS_STANDARD = {
  creator: '0xc2e9a1f4b8d3476590ae12bc7d5f38e4a1b9c6d2',
  lp: '0x1f2e3d4c5b6a798897a6b5c4d3e2f11029384756',
  protocol: '0x9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c',
  buyback: '0x0a1b2c3d4e5f6789987654321fedcba012345678',
} as const;

/** Standard platform fee split: 65 / 15 / 15 / 5 bps (1.00% total). */
const FEE_SCHEDULE_STANDARD = {
  creatorShare: 0.0065,
  lpShare: 0.0015,
  protocolShare: 0.0015,
  buybackShare: 0.0005,
} as const;
const FEE_BPS_STANDARD = { creator: 65, lp: 15, protocol: 15, buyback: 5 };

const VERIFIED_AT = '2026-08-14T08:20:00.000Z';

/** Full T21 battery — every frozen claim kind, each with evidence. */
const T21_FULL = {
  id: 't21:factory-base:v1',
  hash: '0x3d9f2c1e8a7b6d5f4e3c2b1a09876543fedcba9876543210abcdef0123456789',
  claims: [
    {
      claim: 'admin_key_free',
      evidence: 't21/admin-key.spec.ts#no-admin-keyset',
      verifiedAt: VERIFIED_AT,
    },
    {
      claim: 'non_upgradeable',
      evidence: 't21/upgradeability.spec.ts#no-proxy',
      verifiedAt: VERIFIED_AT,
    },
    {
      claim: 'fee_split_invariant',
      evidence: 't21/fee-split.spec.ts#shares-sum',
      verifiedAt: VERIFIED_AT,
    },
    {
      claim: 'bond_accounting',
      evidence: 't21/bond.spec.ts#escrow-balance',
      verifiedAt: VERIFIED_AT,
    },
  ],
} as const;

export const MOCK_LAUNCH_REQUESTS: LaunchRequest[] = [
  {
    id: 'lr_pending_memecoin',
    status: 'pending_review',
    chain: 'base',
    requestedBy: 'agent:surf-desk-01',
    requestedAt: '2026-08-16T07:55:00.000Z',
    context: {
      tokenName: 'Surf Coin',
      tokenSymbol: 'SURF',
      totalSupply: '1000000000000000000000000000',
      factory: LAUNCH_FACTORY,
      feeSchedule: { ...FEE_SCHEDULE_STANDARD },
      feeBps: { ...FEE_BPS_STANDARD },
      feeRecipients: { ...FEE_RECIPIENTS_STANDARD },
      bondPaid: true,
      verification: {
        id: T21_FULL.id,
        hash: T21_FULL.hash,
        claims: T21_FULL.claims.map((entry) => ({ ...entry })),
      },
    },
    decidedAt: null,
    decidedBy: null,
    decisionReason: null,
  },
  {
    id: 'lr_pending_noartifact',
    status: 'pending_review',
    chain: 'base',
    requestedBy: 'agent:nightforge-02',
    requestedAt: '2026-08-16T09:12:00.000Z',
    context: {
      tokenName: 'Ghost Token',
      tokenSymbol: 'GHST',
      totalSupply: '42000000000000000000000000',
      factory: LAUNCH_FACTORY,
      feeSchedule: { ...FEE_SCHEDULE_STANDARD },
      feeBps: { ...FEE_BPS_STANDARD },
      feeRecipients: { ...FEE_RECIPIENTS_STANDARD },
      bondPaid: true,
      // No verification artifact — the detail card must flag this loudly:
      // deploy-gate requires one for allowlisted factories.
    },
    decidedAt: null,
    decidedBy: null,
    decisionReason: null,
  },
  {
    id: 'lr_approved_bluechip',
    status: 'approved',
    chain: 'base',
    requestedBy: 'agent:atlas-desk-03',
    requestedAt: '2026-08-15T14:02:00.000Z',
    context: {
      tokenName: 'Atlas Yield',
      tokenSymbol: 'ATLS',
      totalSupply: '500000000000000000000000000',
      factory: LAUNCH_FACTORY,
      feeSchedule: {
        creatorShare: 0.01,
        lpShare: 0.002,
        protocolShare: 0.002,
        buybackShare: 0.001,
      },
      feeBps: { creator: 100, lp: 20, protocol: 20, buyback: 10 },
      feeRecipients: { ...FEE_RECIPIENTS_STANDARD },
      bondPaid: true,
      verification: {
        id: 't21:factory-base:v2',
        hash: '0x8b42e1d5c7a9f3e6d2b8c4a1f5e9d3b7c2a6f8e4d1b5c9a3f7e2d6b8c4a19f53',
        claims: [
          {
            claim: 'admin_key_free',
            evidence: 't21/admin-key.spec.ts#no-admin-keyset',
            verifiedAt: '2026-08-15T10:40:00.000Z',
          },
          {
            claim: 'non_upgradeable',
            evidence: 't21/upgradeability.spec.ts#no-proxy',
            verifiedAt: '2026-08-15T10:40:00.000Z',
          },
          {
            claim: 'fee_split_invariant',
            evidence: 't21/fee-split.spec.ts#shares-sum',
            verifiedAt: '2026-08-15T10:40:00.000Z',
          },
        ],
      },
    },
    decidedAt: '2026-08-15T16:30:00.000Z',
    decidedBy: 'backoffice:deck',
    decisionReason: 'Full T21 battery verified; fee split at platform norms.',
  },
  {
    id: 'lr_rejected_feegrab',
    status: 'rejected',
    chain: 'base',
    requestedBy: 'agent:quickmint-04',
    requestedAt: '2026-08-14T18:44:00.000Z',
    context: {
      tokenName: 'Moon Grab',
      tokenSymbol: 'MGRB',
      totalSupply: '690000000000000000000000000',
      factory: LAUNCH_FACTORY,
      feeSchedule: {
        creatorShare: 0.05,
        lpShare: 0.001,
        protocolShare: 0.001,
        buybackShare: 0,
      },
      feeBps: { creator: 500, lp: 10, protocol: 10, buyback: 0 },
      feeRecipients: {
        creator: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        lp: '0x1f2e3d4c5b6a798897a6b5c4d3e2f11029384756',
        protocol: '0x9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c',
        buyback: '0x0a1b2c3d4e5f6789987654321fedcba012345678',
      },
      bondPaid: false,
    },
    decidedAt: '2026-08-14T19:10:00.000Z',
    decidedBy: 'backoffice:deck',
    decisionReason:
      'Creator fee 5% is far above platform norms, bond unpaid and no T21 artifact.',
  },
  {
    id: 'lr_deployed_wow',
    status: 'deployed',
    chain: 'base',
    requestedBy: 'agent:surf-desk-01',
    requestedAt: '2026-08-12T11:05:00.000Z',
    context: {
      tokenName: 'Wow Token',
      tokenSymbol: 'WOW',
      totalSupply: '2100000000000000000000000',
      factory: LAUNCH_FACTORY,
      feeSchedule: { ...FEE_SCHEDULE_STANDARD },
      feeBps: { ...FEE_BPS_STANDARD },
      feeRecipients: { ...FEE_RECIPIENTS_STANDARD },
      bondPaid: true,
      verification: {
        id: T21_FULL.id,
        hash: T21_FULL.hash,
        claims: T21_FULL.claims.map((entry) => ({ ...entry })),
      },
    },
    decidedAt: '2026-08-12T13:20:00.000Z',
    decidedBy: 'backoffice:deck',
    decisionReason: 'Clean battery; approved for deploy.',
  },
];

/**
 * Launch-factory health — deck-local shape until the deploy-gate branch
 * ships GET /api/health/launchpad. Mirrors the WorkerHealth card pattern.
 */
export interface FactoryHealth {
  component: string;
  ok: boolean;
  detail: string | null;
  chain: string;
  factory: `0x${string}`;
  pendingReviews: number;
  checkedAt: string;
}

export const MOCK_FACTORY_HEALTH: FactoryHealth = {
  component: 'launchpad-factory',
  ok: true,
  detail: null,
  chain: 'base',
  factory: LAUNCH_FACTORY,
  pendingReviews: 2,
  checkedAt: '2026-08-16T09:30:00.000Z',
};

// Wave 6: signing console fixtures — pending /signing/ endpoint from vault.
export const MOCK_SIGN_REQUESTS: SignRequest[] = [
  {
    id: 'sr_001',
    intentId: 'int_9f3a',
    status: 'pending',
    unsignedTx: {
      to: '0x9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d',
      data: '0x',
      value: '0x3782dace9d9000',
    },
    digest:
      '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
    note: 'Pending external signer decision',
    createdAt: '2026-08-17T10:00:00.000Z',
  },
  {
    id: 'sr_002',
    intentId: 'int_7c1e',
    status: 'dry_run',
    unsignedTx: {
      to: '0x0a1b2c3d4e5f60718293a4b5c6d7e8f901234567',
      data: '0xa9059cbb',
      value: '0x0',
    },
    digest:
      '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    note: 'dry-run only — nothing broadcast',
    createdAt: '2026-08-17T09:45:00.000Z',
  },
];
