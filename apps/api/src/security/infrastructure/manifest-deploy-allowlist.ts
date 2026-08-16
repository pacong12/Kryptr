import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChainId } from '@kryptr/shared-types';
import type { DeployAllowlistPort } from '../application/ports';
import { ADDRESS_PATTERN } from '../../common/address';

/**
 * Layer-2 factory allowlist (wave-5 firewall, launchpad-decision.md
 * condition 3): pinned from the ops deploy manifests — the single
 * source of truth, schema-validated in CI (OpsCI-owned). The vault
 * reads the manifests ONCE at wiring time.
 *
 * Fail-closed by construction: a missing directory, an unparseable
 * file, or a malformed entry can only RESTRICT the allowlist — never
 * widen it. Empty manifests ⇒ every deploy rejects ⇒ the launchpad
 * stays dark until a T21-verified factory lands in the manifests.
 */

/** Required manifest fields (Q3 baseline); missing any ⇒ entry skipped. */
const REQUIRED_FIELDS = [
  'chain',
  'factoryAddress',
  'verificationId',
  'commitSha',
  'deployedAt',
] as const;

export class ManifestDeployAllowlist implements DeployAllowlistPort {
  private constructor(
    private readonly allowed: ReadonlyMap<ChainId, ReadonlySet<string>>,
  ) {}

  /**
   * Load every `*.json` manifest in `dir` once. Never throws: any read
   * or parse problem degrades to a (further) restricted allowlist.
   */
  static fromDir(dir: string): ManifestDeployAllowlist {
    const byChain = new Map<ChainId, Set<string>>();
    let files: string[];
    try {
      files = readdirSync(dir).filter((file) => file.endsWith('.json'));
    } catch {
      return new ManifestDeployAllowlist(byChain);
    }
    for (const file of files) {
      let entry: unknown;
      try {
        entry = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      } catch {
        continue;
      }
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        continue;
      }
      if (!ManifestDeployAllowlist.isValidEntry(entry)) {
        continue;
      }
      const factories = byChain.get(entry.chain) ?? new Set<string>();
      factories.add(entry.factoryAddress.toLowerCase());
      byChain.set(entry.chain, factories);
    }
    return new ManifestDeployAllowlist(byChain);
  }

  isAllowed(chain: ChainId, factory: `0x${string}`): boolean {
    return this.allowed.get(chain)?.has(factory.toLowerCase()) ?? false;
  }

  private static isValidEntry(entry: unknown): entry is {
    chain: ChainId;
    factoryAddress: string;
    verificationId: string;
  } {
    if (typeof entry !== 'object' || entry === null) return false;
    const record = entry as Record<string, unknown>;
    for (const field of REQUIRED_FIELDS) {
      const value = record[field];
      if (typeof value !== 'string' || value.trim().length === 0) {
        return false;
      }
    }
    return ADDRESS_PATTERN.test(record.factoryAddress as string);
  }
}
