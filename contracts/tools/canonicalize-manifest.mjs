#!/usr/bin/env node
/**
 * DeployManifest Canonicalizer - RFC 8785 (JCS) JSON canonicalizer for manifest deployments
 *
 * Sprint 6 Task: Create canonicalizer for manifest deployments to enable immutable content hashes
 * for Base Sepolia deployment artifacts stored in Arweave/IPFS storage.
 *
 * Usage:
 *   node canonicalize-manifest.mjs --self-test          # run embedded vectors
 *   node canonicalize-manifest.mjs manifest.json       # canonical form to stdout
 *   node canonicalize-manifest.mjs --hash manifest.json # sha256 hash of canonical form
 *   node canonicalize-manifest.mjs --check file.json    # exit 0 iff already canonical
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/* ----------------------------- RFC 8785 CANONICALIZER ---------------------------- */

function serialize(value) {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) {
        throw new Error(`non-finite number ${value} has no canonical form`);
      }
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new Error(`non-JSON value of type "${typeof value}"`);
  }
  if (Array.isArray(value)) {
    return `[${value.map(serialize).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const pairs = keys.map((key) => {
    const member = value[key];
    if (member === undefined || typeof member === 'function') {
      throw new Error(`non-JSON value under key "${key}"`);
    }
    return `${JSON.stringify(key)}:${serialize(member)}`;
  });
  return `{${pairs.join(',')}}`;
}

export function canonicalize(value) {
  return serialize(value);
}

/* ----------------------------- DEPLOYMENT MANIFEST STRUCTURE ---------------------------- */

/**
 * Standard DeploymentManifest structure for Base Sepolia testnet
 */
export function createDefaultManifest() {
  return {
    name: 'KryptrLaunchpad',
    version: '1.0.0',
    network: 'base-sepolia',
    chainId: 84532,
    deployedAt: new Date().toISOString(),
    artifacts: {
      TokenFactory: {
        address: '0x0000000000000000000000000000000000000000',
        creationCodeHash: '',
        constructorArgsHash: '',
      },
      Template: {
        address: '0x0000000000000000000000000000000000000000',
        creationCodeHash: '',
        constructorArgsHash: '',
      },
    },
    configuration: {
      bondAmount: '1000000000000000000', // 1 ETH in wei
      minimumInterval: 60, // seconds
      maximumInterval: 3600, // seconds
    },
    metadata: {
      author: 'Kryptr Core Team',
      description: 'Decentralized intent marketplace on Base Sepolia',
      sourceCodeUrl: 'https://github.com/pacong12/Kryptr',
      documentationUrl: 'https://docs.kryptr.test',
    },
    verification: {
      forgeTestsPassing: true,
      slitherClean: true,
      mainBranch: 'main',
      commitHash: '',
    },
  };
}

/* ----------------------------- SELF-TEST ---------------------------- */

const VECTORS = [
  [{ b: 1, a: 2 }, '{"a":2,"b":1}'],
  [{ a: 1, aB: 2, ab: 3, A: 4 }, '{"A":4,"a":1,"aB":2,"ab":3}'],
  [
    { nested: { z: [3, 2, 1], a: { y: true, x: null } } },
    '{"nested":{"a":{"x":null,"y":true},"z":[3,2,1]}}',
  ],
  [[], '[]'],
  [{}, '{}'],
];

const REJECTS = [
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
  ['bigint', 1n],
  ['undefined member', { a: undefined }],
];

function selfTest() {
  let failures = 0;
  for (const [input, expected] of VECTORS) {
    const got = canonicalize(input);
    if (got !== expected) {
      failures += 1;
      console.error(
        `[canonicalize-manifest] VECTOR FAIL:\n  got      ${got}\n  expected ${expected}`,
      );
    }
  }
  for (const [name, input] of REJECTS) {
    let threw = false;
    try {
      canonicalize(input);
    } catch {
      threw = true;
    }
    if (!threw) {
      failures += 1;
      console.error(`[canonicalize-manifest] REJECT FAIL: ${name} did not throw`);
    }
  }
  if (failures > 0) {
    console.error(`[canonicalize-manifest] ${failures} self-test failure(s)`);
    process.exit(1);
  }
  console.log(
    `[canonicalize-manifest] self-test OK — ${VECTORS.length} vectors, ${REJECTS.length} rejections.`,
  );
}

/* ------------------------------- CLI ---------------------------------- */

const isMain =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const args = process.argv.slice(2);
  if (args[0] === '--self-test') {
    selfTest();
  } else if (!args[0]) {
    console.error(
      'usage: canonicalize-manifest.mjs --self-test | <manifest.json> | --hash <manifest.json> | --check <manifest.json>',
    );
    process.exit(2);
  } else {
    const check = args[0] === '--check';
    const hashMode = args[0] === '--hash';
    const file = check || hashMode ? args[1] : args[0];
    const raw = readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    const canonical = canonicalize(data);

    if (check) {
      const normalized = raw.replace(/\s+$/, '');
      if (normalized === canonical) {
        console.log('[canonicalize-manifest] file is in canonical form.');
      } else {
        console.error('[canonicalize-manifest] file is NOT in canonical form.');
        process.exit(1);
      }
    } else if (hashMode) {
      const hash = createHash('sha256').update(canonical).digest('hex');
      console.log(`[canonicalize-manifest] contentHash: ${hash}`);
    } else {
      process.stdout.write(`${canonical}\n`);
    }
  }
}
