/**
 * Venue registry validator (wave-6 S4, design §2.2).
 *
 * Fail-closed posture: every contracts/deployments/venues/{chain}.venues.json
 * must carry the schema defined in wave6-s4-venue-design.md §2.2. Enforces:
 *   - shape validation (required fields, correct types)
 *   - unique venueIds across all files
 *   - two-human fields (addedBy, approvedBy) must be non-empty
 *   - status must be one of: active, suspended, superseded
 *   - supersededBy must reference a valid venueId or be null
 *
 * Pattern follows validate-manifests.mjs (zero-dependency, structural checks).
 * Runs via CI contracts job when venue files exist; graceful no-op otherwise.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const venuesDir = join(here, '..', 'deployments', 'venues');

const VALID_STATUSES = ['active', 'suspended', 'superseded'];
const VENUE_ID_RE = /^[a-z0-9][a-z0-9:-]*[a-z0-9]$/;

function fail(file, reason) {
  console.error(`[venues] INVALID ${file}: ${reason}`);
  process.exitCode = 1;
}

if (!existsSync(venuesDir)) {
  console.log('[venues] no deployments/venues/ directory — S4 not yet deployed (expected). Gate passes.');
  process.exit(0);
}

const files = readdirSync(venuesDir).filter((f) => f.endsWith('.venues.json'));
if (files.length === 0) {
  console.log('[venues] deployments/venues/ is empty — no venue files yet (expected). Gate passes.');
  process.exit(0);
}

const allVenueIds = new Set();
let totalVenues = 0;

for (const file of files) {
  const path = join(venuesDir, file);
  let registry;
  try {
    registry = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail(file, `unparseable JSON (${err.message})`);
    continue;
  }
  if (typeof registry !== 'object' || registry === null || Array.isArray(registry)) {
    fail(file, 'registry must be a JSON object');
    continue;
  }

  // Validate chain object
  if (!registry.chain || typeof registry.chain !== 'object') {
    fail(file, 'missing or invalid "chain" object');
    continue;
  }
  if (typeof registry.chain.chainId !== 'number' || !Number.isInteger(registry.chain.chainId)) {
    fail(file, `chain.chainId must be an integer (got: ${registry.chain.chainId})`);
  }
  if (typeof registry.chain.name !== 'string' || registry.chain.name.trim().length === 0) {
    fail(file, 'chain.name must be a non-empty string');
  }

  // Validate venues array
  if (!Array.isArray(registry.venues)) {
    fail(file, '"venues" must be an array');
    continue;
  }

  for (let i = 0; i < registry.venues.length; i++) {
    const v = registry.venues[i];
    const prefix = `venues[${i}]`;

    if (typeof v !== 'object' || v === null) {
      fail(file, `${prefix}: must be an object`);
      continue;
    }

    // venueId: required, unique, pattern
    if (typeof v.venueId !== 'string' || v.venueId.trim().length === 0) {
      fail(file, `${prefix}: missing or empty "venueId"`);
    } else if (!VENUE_ID_RE.test(v.venueId)) {
      fail(file, `${prefix}: venueId "${v.venueId}" does not match pattern ${VENUE_ID_RE}`);
    } else if (allVenueIds.has(v.venueId)) {
      fail(file, `${prefix}: duplicate venueId "${v.venueId}" (must be unique across all files)`);
    } else {
      allVenueIds.add(v.venueId);
    }

    // kind: required string
    if (typeof v.kind !== 'string' || v.kind.trim().length === 0) {
      fail(file, `${prefix}: missing or empty "kind"`);
    }

    // adapterPort: required string
    if (typeof v.adapterPort !== 'string' || v.adapterPort.trim().length === 0) {
      fail(file, `${prefix}: missing or empty "adapterPort"`);
    }

    // poolCreationParams: required object with venueBps
    if (!v.poolCreationParams || typeof v.poolCreationParams !== 'object') {
      fail(file, `${prefix}: missing or invalid "poolCreationParams"`);
    } else if (typeof v.poolCreationParams.venueBps !== 'number' || v.poolCreationParams.venueBps < 0) {
      fail(file, `${prefix}: poolCreationParams.venueBps must be a non-negative number`);
    }

    // feeAccrualLayer: required string
    if (typeof v.feeAccrualLayer !== 'string' || v.feeAccrualLayer.trim().length === 0) {
      fail(file, `${prefix}: missing or empty "feeAccrualLayer"`);
    }

    // status: required, one of valid values
    if (typeof v.status !== 'string' || !VALID_STATUSES.includes(v.status)) {
      fail(file, `${prefix}: status must be one of ${VALID_STATUSES.join(', ')} (got: ${v.status})`);
    }

    // addedAt: required ISO-8601
    if (typeof v.addedAt !== 'string' || Number.isNaN(Date.parse(v.addedAt))) {
      fail(file, `${prefix}: addedAt must be a parseable ISO-8601 timestamp`);
    }

    // addedBy: required non-empty (human identity)
    if (typeof v.addedBy !== 'string' || v.addedBy.trim().length === 0) {
      fail(file, `${prefix}: addedBy must be a non-empty string (human identity)`);
    }

    // approvedBy: required non-empty (second human)
    if (typeof v.approvedBy !== 'string' || v.approvedBy.trim().length === 0) {
      fail(file, `${prefix}: approvedBy must be a non-empty string (second human identity)`);
    }

    // addedBy and approvedBy must be different (two-human rule)
    if (typeof v.addedBy === 'string' && typeof v.approvedBy === 'string' &&
        v.addedBy.trim().toLowerCase() === v.approvedBy.trim().toLowerCase()) {
      fail(file, `${prefix}: addedBy and approvedBy must be different humans`);
    }

    // supersededBy: null or string referencing another venueId
    if (v.supersededBy !== null && typeof v.supersededBy !== 'string') {
      fail(file, `${prefix}: supersededBy must be null or a string`);
    }

    totalVenues++;
  }

  if (process.exitCode !== 1) {
    console.log(`[venues] OK ${file}: chain=${registry.chain.name} (${registry.chain.chainId}), ${registry.venues.length} venue(s)`);
  }
}

// Second pass: verify supersededBy references exist
if (process.exitCode !== 1) {
  for (const file of files) {
    const path = join(venuesDir, file);
    const registry = JSON.parse(readFileSync(path, 'utf8'));
    for (let i = 0; i < registry.venues.length; i++) {
      const v = registry.venues[i];
      if (v.supersededBy !== null && !allVenueIds.has(v.supersededBy)) {
        fail(file, `venues[${i}]: supersededBy "${v.supersededBy}" references unknown venueId`);
      }
    }
  }
}

if (process.exitCode === 1) {
  console.error('[venues] validation FAILED — fail-closed: fix venue registry before merge.');
} else {
  console.log(`[venues] validated ${files.length} file(s), ${totalVenues} venue(s) total.`);
}
