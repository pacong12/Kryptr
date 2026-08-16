#!/usr/bin/env node
/**
 * Never-triage guard for contracts/slither.db.json (wave-5 gate #2 +
 * T21 §5.3, wave5-t21-verification-design.md).
 *
 * The eight detectors below may have ZERO triage-database entries —
 * triaged or not, any hit is a NO-GO (SLITHER_TRIAGE.md, binding).
 * This script fails closed if slither.db.json ever records one of
 * them, so a "just this once" triage acceptance can never slip in
 * silently.
 *
 * States:
 *  - slither.db.json missing  -> pass with a note (pre-factory state).
 *  - empty array              -> pass.
 *  - any never-triage entry   -> exit 1, naming the detector(s).
 *
 * Zero dependencies; runs after the slither gate in the same target.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NEVER_TRIAGE = [
  'suicidal',
  'unprotected-upgrade',
  'arbitrary-send-eth',
  'arbitrary-send-erc20',
  'arbitrary-send-erc20-permit',
  'controlled-delegatecall',
  'uninitialized-storage',
  'reentrancy-eth',
];

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = join(here, '..', 'slither.db.json');

if (!existsSync(dbPath)) {
  console.log(
    '[triage-guard] no slither.db.json — nothing triaged yet (pre-factory state). OK.',
  );
  process.exit(0);
}

let raw;
try {
  raw = readFileSync(dbPath, 'utf8');
} catch (err) {
  console.error(`[triage-guard] UNREADABLE slither.db.json: ${err.message}`);
  console.error('[triage-guard] fail-closed: fix before merge.');
  process.exit(1);
}

let db;
try {
  db = JSON.parse(raw);
} catch (err) {
  console.error(`[triage-guard] UNPARSEABLE slither.db.json: ${err.message}`);
  console.error('[triage-guard] fail-closed: fix before merge.');
  process.exit(1);
}

if (!Array.isArray(db)) {
  console.error(
    '[triage-guard] slither.db.json must be a JSON array (the Slither loader crashes on object shape).',
  );
  process.exit(1);
}

// Primary check: the `check` field of every triage entry. Defensive
// fallback: an exact-name scan of the raw text, so an unknown future
// entry shape cannot smuggle a never-triage detector past the guard.
const hits = new Set();
for (const entry of db) {
  if (
    entry !== null &&
    typeof entry === 'object' &&
    typeof entry.check === 'string' &&
    NEVER_TRIAGE.includes(entry.check)
  ) {
    hits.add(entry.check);
  }
}
for (const detector of NEVER_TRIAGE) {
  if (new RegExp(`(^|[^a-z-])${detector}($|[^a-z-])`).test(raw)) {
    hits.add(detector);
  }
}

if (hits.size > 0) {
  for (const detector of [...hits].sort()) {
    console.error(
      `[triage-guard] NEVER-TRIAGE detector present in slither.db.json: ${detector}`,
    );
  }
  console.error(
    '[triage-guard] T21 §5.3 / SLITHER_TRIAGE.md: these detectors must have zero findings, triaged or not — any hit is a NO-GO. Remove the triage entry AND fix the finding.',
  );
  process.exit(1);
}

console.log(
  `[triage-guard] OK — ${db.length} triage entr${db.length === 1 ? 'y' : 'ies'}, zero never-triage detectors.`,
);
