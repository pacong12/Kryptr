import type { AgentWallet, WalletBalance } from '@kryptr/shared-types';

/**
 * Fixture data shown when the Kryptr API is unreachable (mock mode), so the
 * UI stays explorable offline. Shapes come from @kryptr/shared-types — no
 * local domain types.
 */
export const MOCK_WALLETS: AgentWallet[] = [
  {
    id: 'wallet-base-demo',
    address: '0xA1b2C3d4E5f60718293A4B5c6D7e8F9012345678',
    ownerId: 'demo-user',
    chains: ['base'],
    createdAt: '2026-08-01T09:30:00.000Z',
    lastKeyRotationAt: null,
  },
  {
    id: 'wallet-dual-demo',
    address: '0xB2c3D4e5F60718293A4b5C6d7E8f901234567890',
    ownerId: 'demo-user',
    chains: ['base', 'robinhood-chain'],
    createdAt: '2026-08-03T14:05:00.000Z',
    lastKeyRotationAt: '2026-08-10T08:00:00.000Z',
  },
];

const MOCK_BALANCES: Record<string, WalletBalance[]> = {
  'wallet-base-demo': [
    {
      walletId: 'wallet-base-demo',
      chain: 'base',
      nativeBalance: '1250000000000000000',
      tokens: [
        {
          contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          symbol: 'USDC',
          decimals: 6,
          amount: '1250500000',
        },
        {
          contractAddress: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
          symbol: 'DEGEN',
          decimals: 18,
          amount: '42000000000000000000000',
        },
      ],
    },
  ],
  'wallet-dual-demo': [
    {
      walletId: 'wallet-dual-demo',
      chain: 'base',
      nativeBalance: '90000000000000000',
      tokens: [
        {
          contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          symbol: 'USDC',
          decimals: 6,
          amount: '75000000',
        },
      ],
    },
    {
      walletId: 'wallet-dual-demo',
      chain: 'robinhood-chain',
      nativeBalance: '420000000000000000000',
      tokens: [],
    },
  ],
};

/** Fixture balances for a wallet; unknown ids get a single empty-chain set. */
export function mockBalancesFor(walletId: string): WalletBalance[] {
  return (
    MOCK_BALANCES[walletId] ?? [
      {
        walletId,
        chain: 'base',
        nativeBalance: '0',
        tokens: [],
      },
    ]
  );
}

/** Random 0x-prefixed 40-hex-char EVM address for demo/wave-1 wallets. */
export function randomAddress(): `0x${string}` {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `0x${hex}`;
}

/** Locally fabricated wallet used by "New wallet" while in mock mode. */
export function createMockWallet(): AgentWallet {
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    id: `wallet-mock-${suffix}`,
    address: randomAddress(),
    ownerId: 'demo-user',
    chains: ['base'],
    createdAt: new Date().toISOString(),
    lastKeyRotationAt: null,
  };
}
