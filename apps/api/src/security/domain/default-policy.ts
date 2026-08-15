import type { AgentWallet, SecurityPolicy } from '@kryptr/shared-types';

/**
 * Conservative default policy provisioned when a wallet is created.
 * Human-only origins, modest threshold/cap, payload inspection on.
 * Tightening/relaxing is an explicit policy change (Wave 2: backoffice,
 * MFA-gated per threat model HITL-4).
 */
export function defaultPolicyFor(wallet: AgentWallet): SecurityPolicy {
  return {
    walletId: wallet.id,
    allowedOrigins: ['user'],
    approvalThresholdUsd: 100,
    dailyCapUsd: 1000,
    allowedChains: [...wallet.chains],
    rejectEncodedPayloads: true,
  };
}
