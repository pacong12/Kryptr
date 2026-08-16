/**
 * Deploy-manifest validator (wave-5 entry gate, Q3 baseline).
 *
 * Fail-closed posture: every contracts/deployments/{chain}.json must carry
 * {chain, factoryAddress, verificationId, commitSha, deployedAt}; a missing
 * verificationId is INVALID (no artifact → no vault allowlist entry →
 * factory stays dark). Optional: verificationHash, salt, verificationTx.
 *
 * Zero-dependency by design: structural checks only (the JSON Schema at
 * contracts/deployments.schema.json is the human/tooling reference). Runs
 * via `nx run @kryptr/contracts:manifests` and in CI's contracts job.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const deploymentsDir = join(here, '..', 'deployments');

const REQUIRED_FIELDS = [
  'chain',
  'factoryAddress',
  'verificationId',
  'commitSha',
  'deployedAt',
];
const OPTIONAL_FIELDS = ['verificationHash', 'salt', 'verificationTx'];
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SHA_RE = /^[0-9a-f]{7,40}$/;

function fail(file, reason) {
  console.error(`[manifests] INVALID ${file}: ${reason}`);
  process.exitCode = 1;
}

if (!existsSync(deploymentsDir)) {
  console.log(
    '[manifests] no deployments/ directory yet — nothing to validate.',
  );
  process.exit(0);
}

const files = readdirSync(deploymentsDir).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.log(
    '[manifests] deployments/ is empty — nothing to validate (pre-launch state).',
  );
  process.exit(0);
}

for (const file of files) {
  const path = join(deploymentsDir, file);
  let entry;
  try {
    entry = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail(file, `unparseable JSON (${err.message})`);
    continue;
  }
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    fail(file, 'manifest must be a JSON object');
    continue;
  }

  for (const field of REQUIRED_FIELDS) {
    if (typeof entry[field] !== 'string' || entry[field].trim().length === 0) {
      fail(file, `missing or empty required field "${field}"`);
    }
  }
  for (const key of Object.keys(entry)) {
    if (!REQUIRED_FIELDS.includes(key) && !OPTIONAL_FIELDS.includes(key)) {
      fail(
        file,
        `unknown field "${key}" (schema: contracts/deployments.schema.json)`,
      );
    }
  }
  if (
    typeof entry.factoryAddress === 'string' &&
    !ADDRESS_RE.test(entry.factoryAddress)
  ) {
    fail(
      file,
      `factoryAddress is not a 0x-prefixed 40-hex address: ${entry.factoryAddress}`,
    );
  }
  if (typeof entry.commitSha === 'string' && !SHA_RE.test(entry.commitSha)) {
    fail(file, `commitSha is not a git sha: ${entry.commitSha}`);
  }
  if (
    typeof entry.deployedAt === 'string' &&
    Number.isNaN(Date.parse(entry.deployedAt))
  ) {
    fail(
      file,
      `deployedAt is not a parseable ISO-8601 timestamp: ${entry.deployedAt}`,
    );
  }

  if (process.exitCode !== 1) {
    console.log(
      `[manifests] OK ${file}: chain=${entry.chain} factory=${entry.factoryAddress} verificationId=${entry.verificationId}`,
    );
  }
}

if (process.exitCode === 1) {
  console.error(
    '[manifests] validation FAILED — fail-closed: fix manifests before merge.',
  );
} else {
  console.log(`[manifests] validated ${files.length} manifest(s).`);
}
