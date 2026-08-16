#!/usr/bin/env node
/**
 * Independent G5 contentHash verifier (runbook §7 pass criterion: "hash
 * reproducible by an independent re-canonicalization").
 *
 * The battery PRODUCES contracts/deployments/{chain}.verification.json
 * with a recorded `contentHash`. Trusting the producer's hash would let
 * a broken assembly step self-certify, so the release-tag workflow
 * re-derives it here: strip `contentHash`, canonicalize the remainder
 * with the in-repo pinned RFC 8785 canonicalizer (canonicalize.mjs),
 * sha256 it, and compare. Mismatch = fail closed, no artifact.
 *
 * Usage:
 *   node verify-content-hash.mjs path/to/x.verification.json [...]
 * Zero dependencies (node:crypto + the pinned in-repo canonicalizer).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalize } from './canonicalize.mjs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error(
    'usage: verify-content-hash.mjs <file.verification.json> [...]',
  );
  process.exit(2);
}

let failures = 0;
for (const file of files) {
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    failures += 1;
    console.error(
      `[content-hash] ${file}: unreadable/unparseable — ${err.message}`,
    );
    continue;
  }
  if (
    typeof artifact !== 'object' ||
    artifact === null ||
    Array.isArray(artifact)
  ) {
    failures += 1;
    console.error(`[content-hash] ${file}: artifact must be a JSON object`);
    continue;
  }
  const recorded = artifact.contentHash;
  if (typeof recorded !== 'string' || !/^[0-9a-fA-F]{64}$/.test(recorded)) {
    failures += 1;
    console.error(`[content-hash] ${file}: missing or malformed contentHash`);
    continue;
  }
  const { contentHash: _excluded, ...rest } = artifact;
  const derived = createHash('sha256').update(canonicalize(rest)).digest('hex');
  if (derived.toLowerCase() === recorded.toLowerCase()) {
    console.log(`[content-hash] ${file}: OK (${derived})`);
  } else {
    failures += 1;
    console.error(`[content-hash] ${file}: MISMATCH`);
    console.error(`[content-hash]   recorded ${recorded}`);
    console.error(`[content-hash]   derived  ${derived}`);
    console.error(
      '[content-hash] artifact is NOT what its hash claims — fail closed, no artifact.',
    );
  }
}

if (failures > 0) {
  console.error(`[content-hash] ${failures} artifact(s) failed verification.`);
  process.exit(1);
}
console.log(
  `[content-hash] all ${files.length} artifact(s) verified independently.`,
);
