import type {
  AgentWallet,
  ChainReaderHealth,
  FeedHealth,
  IntentTimelineStep,
  KillSwitchMode,
  KillSwitchState,
  Order,
  OrderExecution,
  SecurityDecision,
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

/**
 * One audited kill-switch mode change (freeze §3: actor, at, from→to,
 * reason). Deck-local shape until the worker API ships the audit endpoint.
 */
export interface KillSwitchAuditEntry {
  actor: string;
  /** ISO-8601. */
  at: string;
  from: KillSwitchMode;
  to: KillSwitchMode;
  reason: string | null;
}

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
