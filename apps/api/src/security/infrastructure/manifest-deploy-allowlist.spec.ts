import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ManifestDeployAllowlist } from './manifest-deploy-allowlist';

/**
 * Layer-2 factory allowlist backed by the ops deploy manifests
 * (contracts/deployments/{chain}.json, schema-validated in CI —
 * OpsCI-owned). The vault reads them ONCE at wiring time and
 * fail-closes on every ambiguity: missing dir, unparseable file, or a
 * malformed entry can only RESTRICT the allowlist, never widen it.
 */

const FACTORY = '0xaaaa000000000000000000000000000000000001';

function validEntry(overrides: Record<string, unknown> = {}) {
  return {
    chain: 'base',
    factoryAddress: FACTORY,
    verificationId: 't21:factory-base:v1',
    commitSha: 'abc1234',
    deployedAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  };
}

describe('ManifestDeployAllowlist (fail-closed by construction)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'manifests-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('missing directory ⇒ empty allowlist (launchpad stays dark)', () => {
    const allowlist = ManifestDeployAllowlist.fromDir(join(dir, 'nope'));
    expect(allowlist.isAllowed('base', FACTORY as `0x${string}`)).toBe(false);
  });

  it('empty directory ⇒ empty allowlist (pre-launch posture)', () => {
    const allowlist = ManifestDeployAllowlist.fromDir(dir);
    expect(allowlist.isAllowed('base', FACTORY as `0x${string}`)).toBe(false);
  });

  it('allowlists a factory on its own chain from a valid manifest', () => {
    writeFileSync(join(dir, 'base.json'), JSON.stringify(validEntry()));
    const allowlist = ManifestDeployAllowlist.fromDir(dir);
    expect(allowlist.isAllowed('base', FACTORY as `0x${string}`)).toBe(true);
  });

  it('matches queried addresses case-insensitively (checksum forms)', () => {
    writeFileSync(join(dir, 'base.json'), JSON.stringify(validEntry()));
    const allowlist = ManifestDeployAllowlist.fromDir(dir);
    const upper = FACTORY.toUpperCase().replace('0X', '0x') as `0x${string}`;
    expect(allowlist.isAllowed('base', upper)).toBe(true);
  });

  it('never leaks an allowlist entry across chains', () => {
    writeFileSync(join(dir, 'base.json'), JSON.stringify(validEntry()));
    const allowlist = ManifestDeployAllowlist.fromDir(dir);
    expect(allowlist.isAllowed('ethereum', FACTORY as `0x${string}`)).toBe(
      false,
    );
  });

  it('skips entries missing verificationId (no artifact ⇒ stays dark)', () => {
    const { verificationId: _dropped, ...entry } = validEntry();
    writeFileSync(join(dir, 'base.json'), JSON.stringify(entry));
    const allowlist = ManifestDeployAllowlist.fromDir(dir);
    expect(allowlist.isAllowed('base', FACTORY as `0x${string}`)).toBe(false);
  });

  it('skips entries with an empty verificationId', () => {
    writeFileSync(
      join(dir, 'base.json'),
      JSON.stringify(validEntry({ verificationId: '  ' })),
    );
    const allowlist = ManifestDeployAllowlist.fromDir(dir);
    expect(allowlist.isAllowed('base', FACTORY as `0x${string}`)).toBe(false);
  });

  it('skips entries with malformed addresses', () => {
    writeFileSync(
      join(dir, 'base.json'),
      JSON.stringify(validEntry({ factoryAddress: '0x123' })),
    );
    const allowlist = ManifestDeployAllowlist.fromDir(dir);
    expect(allowlist.isAllowed('base', '0x123' as `0x${string}`)).toBe(false);
  });

  it('skips unparseable manifest files entirely', () => {
    writeFileSync(join(dir, 'base.json'), '{ not json');
    const allowlist = ManifestDeployAllowlist.fromDir(dir);
    expect(allowlist.isAllowed('base', FACTORY as `0x${string}`)).toBe(false);
  });

  it('skips non-object manifest roots (arrays)', () => {
    writeFileSync(join(dir, 'base.json'), JSON.stringify([validEntry()]));
    const allowlist = ManifestDeployAllowlist.fromDir(dir);
    expect(allowlist.isAllowed('base', FACTORY as `0x${string}`)).toBe(false);
  });

  it('indexes multiple manifests independently (one bad file cannot poison the rest)', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'base.json'), JSON.stringify(validEntry()));
    writeFileSync(join(dir, 'ethereum.json'), '{ broken');
    const allowlist = ManifestDeployAllowlist.fromDir(dir);
    expect(allowlist.isAllowed('base', FACTORY as `0x${string}`)).toBe(true);
    expect(allowlist.isAllowed('ethereum', FACTORY as `0x${string}`)).toBe(
      false,
    );
  });

  it('ignores non-json files in the directory', () => {
    writeFileSync(join(dir, 'base.json'), JSON.stringify(validEntry()));
    writeFileSync(join(dir, 'README.md'), 'not a manifest');
    const allowlist = ManifestDeployAllowlist.fromDir(dir);
    expect(allowlist.isAllowed('base', FACTORY as `0x${string}`)).toBe(true);
  });
});
