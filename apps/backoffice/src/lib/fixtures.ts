import type {
  AgentWallet,
  SecurityDecision,
  TransactionIntent,
  TransactionStatus,
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
