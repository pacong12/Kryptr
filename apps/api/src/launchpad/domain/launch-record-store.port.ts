/**
 * Deploy-record persistence (wave-6 S1 §3.1): the launch-state home joining
 * S2 (ceremony publish), G4 (readback writes), and the backoffice timeline.
 * One row per ceremony stage attempt. Stores NO key material — the manual
 * signature happens in the operator's wallet, outside this system.
 */

export const LAUNCH_RECORD_STORE = 'launchpad.launch-record-store';

export type DeployStage = 'template' | 'factory';

export const DEPLOY_RECORD_STATUSES = [
  'published',
  'signed_offchain',
  'broadcast',
  'readback_passed',
  'readback_rejected',
] as const;
export type DeployRecordStatus = (typeof DEPLOY_RECORD_STATUSES)[number];

/** Append-only forward lifecycle (S2 §8): a readback REJECT is recorded,
 *  never silently retried; no backward or skipping transitions. */
export const DEPLOY_RECORD_TRANSITIONS: Record<
  DeployRecordStatus,
  readonly DeployRecordStatus[]
> = {
  published: ['signed_offchain'],
  signed_offchain: ['broadcast'],
  broadcast: ['readback_passed', 'readback_rejected'],
  readback_passed: [],
  readback_rejected: [],
};

export interface DeployRecord {
  id: string;
  stage: DeployStage;
  chain: string;
  releaseTag: string;
  commitSha: string;
  /** Repo path of the committed payload file — the official channel. */
  payloadFile: string;
  /** Published keccak of the exact bytes to sign. */
  calldataKeccak: string;
  /** Advisory expected nonce (S2 P6); null when not captured. */
  expectedNonce: number | null;
  /** Kit round-trip decoded constructor args; null for the template stage. */
  decodedConstructorArgs: Record<string, unknown> | null;
  /** Echoed frozen constants (totalFeeBps, bondAmount, bondSink — factory). */
  frozenConstants: Record<string, unknown> | null;
  status: DeployRecordStatus;
  txHash: string | null;
  /** From the receipt at readback — NEVER from prediction. */
  deployedAddress: string | null;
  /** ISO-8601. */
  readbackAt: string | null;
  rejectionReason: string | null;
  /** ISO-8601. */
  createdAt: string;
  updatedAt: string;
}

export interface LaunchRecordStore {
  /** Publish a ceremony payload record (status starts at 'published'). */
  publish(
    record: Pick<
      DeployRecord,
      | 'id'
      | 'stage'
      | 'chain'
      | 'releaseTag'
      | 'commitSha'
      | 'payloadFile'
      | 'calldataKeccak'
      | 'expectedNonce'
      | 'decodedConstructorArgs'
      | 'frozenConstants'
    >,
  ): Promise<DeployRecord>;
  findById(id: string): Promise<DeployRecord | null>;
  /**
   * One forward lifecycle step. Throws DomainError('invalid_transition')
   * for backward/skipping moves and unknown ids (fail-closed); the audit
   * trail never shows a silent retry.
   */
  transition(
    id: string,
    patch: {
      status: DeployRecordStatus;
      txHash?: string;
      deployedAddress?: string;
      rejectionReason?: string;
    },
  ): Promise<DeployRecord>;
}
