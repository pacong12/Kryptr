import { DomainError } from '../../common/domain-error';
import {
  DEPLOY_RECORD_TRANSITIONS,
  type DeployRecord,
  type LaunchRecordStore,
} from '../domain/launch-record-store.port';

/**
 * In-memory deploy-record store — the hermetic analogue of the Postgres
 * adapter. Enforces the same append-only forward lifecycle (S2 §8): a
 * readback REJECT is recorded, never silently retried.
 */
export class InMemoryLaunchRecordStore implements LaunchRecordStore {
  private readonly byId = new Map<string, DeployRecord>();

  async publish(
    record: Parameters<LaunchRecordStore['publish']>[0],
  ): Promise<DeployRecord> {
    if (this.byId.has(record.id)) {
      throw new DomainError(
        'duplicate_deploy_record',
        `deploy record "${record.id}" already exists`,
        409,
      );
    }
    const now = new Date().toISOString();
    const stored: DeployRecord = {
      ...record,
      status: 'published',
      txHash: null,
      deployedAddress: null,
      readbackAt: null,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(record.id, stored);
    return { ...stored };
  }

  async findById(id: string): Promise<DeployRecord | null> {
    const found = this.byId.get(id);
    return found ? { ...found } : null;
  }

  async transition(
    id: string,
    patch: Parameters<LaunchRecordStore['transition']>[1],
  ): Promise<DeployRecord> {
    const found = this.byId.get(id);
    if (!found) {
      throw new DomainError(
        'invalid_transition',
        `deploy record "${id}" not found`,
        404,
      );
    }
    if (!DEPLOY_RECORD_TRANSITIONS[found.status].includes(patch.status)) {
      throw new DomainError(
        'invalid_transition',
        `deploy record "${id}": ${found.status} -> ${patch.status} is not a forward lifecycle step`,
      );
    }
    found.status = patch.status;
    if (patch.txHash !== undefined) {
      found.txHash = patch.txHash;
    }
    if (patch.deployedAddress !== undefined) {
      found.deployedAddress = patch.deployedAddress;
    }
    if (patch.rejectionReason !== undefined) {
      found.rejectionReason = patch.rejectionReason;
    }
    if (
      patch.status === 'readback_passed' ||
      patch.status === 'readback_rejected'
    ) {
      found.readbackAt = new Date().toISOString();
    }
    found.updatedAt = new Date().toISOString();
    return { ...found };
  }
}
