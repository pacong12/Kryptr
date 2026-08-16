#!/usr/bin/env node
/**
 * RFC 8785 (JCS) JSON canonicalizer — zero dependencies, in-repo.
 *
 * G5 artifact contract (wave5-release-tag-battery-runbook.md): the
 * battery artifact's `contentHash` is the sha256 of the RFC 8785
 * canonical form of the artifact object (contentHash field excluded).
 * This tool is the PINNED canonicalizer — pinned by commit sha like
 * everything else, with zero npm surface (Web3Intel requirement).
 *
 * Rules implemented (RFC 8785 / draft-rundgren-json-canonicalization):
 *  - Objects: keys sorted by UTF-16 code units (JS default sort), no
 *    whitespace, `key:value` pairs joined by commas.
 *  - Arrays: element order preserved, no whitespace.
 *  - Strings: ECMAScript JSON string escaping (JSON.stringify), which
 *    is exactly RFC 8785 §3.2.2.
 *  - Numbers: ECMAScript Number-to-string conversion (JSON.stringify),
 *    which is exactly RFC 8785 §7.1.4 for all finite IEEE-754 doubles.
 *  - Recursion rejects non-JSON values (undefined, function, symbol,
 *    bigint) — canonical form exists only for JSON data.
 *
 * Usage:
 *   node canonicalize.mjs --self-test          # run embedded vectors
 *   node canonicalize.mjs artifact.json        # canonical form to stdout
 *   node canonicalize.mjs --check file.json    # exit 0 iff already canonical
 */
import { readFileSync } from 'node:fs';

function serialize(value) {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      // JSON.stringify silently coerces NaN/Infinity to null — RFC 8785
      // has NO canonical form for non-finite numbers, so reject loudly.
      if (!Number.isFinite(value)) {
        throw new Error(`non-finite number ${value} has no canonical form`);
      }
      // Finite values: JSON.stringify emits ES number serialization —
      // exactly RFC 8785 §7.1.4.
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
  // Object.keys order is irrelevant: UTF-16 code-unit sort is mandated.
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

/* ----------------------------- self-test ------------------------------ */

const VECTORS = [
  // Key ordering (UTF-16 code units: 'A'(0x41) < 'a'(0x61), 'B' < 'b').
  [{ b: 1, a: 2 }, '{"a":2,"b":1}'],
  [{ a: 1, aB: 2, ab: 3, A: 4 }, '{"A":4,"a":1,"aB":2,"ab":3}'],
  // Nested objects + arrays: recursive sort, array order preserved.
  [
    { nested: { z: [3, 2, 1], a: { y: true, x: null } } },
    '{"nested":{"a":{"x":null,"y":true},"z":[3,2,1]}}',
  ],
  // Number serialization (ES == RFC 8785 §7.1.4): 1e30 -> "1e+30",
  // -0 -> "0", integers stay bare, fractions keep shortest ES form.
  [
    [1e30, -0, 0.1, 333333333.3333333, 1e21],
    '[1e+30,0,0.1,333333333.3333333,1e+21]',
  ],
  // String escaping: control chars escaped, printable unicode raw.
  [{ '\u20ac': '\u0001\u001f\n' }, '{"€":"\\u0001\\u001f\\n"}'],
  // Non-BMP code point stays raw (no surrogate escaping).
  [{ '\u{10080}': 1 }, '{"\u{10080}":1}'],
  // Empty containers.
  [{}, '{}'],
  [[], '[]'],
];

const REJECTS = [
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
  ['bigint', 1n],
  ['undefined member', { a: undefined }],
  ['function member', { a: () => 1 }],
];

function selfTest() {
  let failures = 0;
  for (const [input, expected] of VECTORS) {
    const got = canonicalize(input);
    if (got !== expected) {
      failures += 1;
      console.error(
        `[canonicalize] VECTOR FAIL:\n  got      ${got}\n  expected ${expected}`,
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
      console.error(`[canonicalize] REJECT FAIL: ${name} did not throw`);
    }
  }
  if (failures > 0) {
    console.error(`[canonicalize] ${failures} self-test failure(s)`);
    process.exit(1);
  }
  console.log(
    `[canonicalize] self-test OK — ${VECTORS.length} vectors, ${REJECTS.length} rejections.`,
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
      'usage: canonicalize.mjs --self-test | <file.json> | --check <file.json>',
    );
    process.exit(2);
  } else {
    const check = args[0] === '--check';
    const file = check ? args[1] : args[0];
    const raw = readFileSync(file, 'utf8');
    const canonical = canonicalize(JSON.parse(raw));
    if (check) {
      const normalized = raw.replace(/\s+$/, '');
      if (normalized === canonical) {
        console.log('[canonicalize] file is in canonical form.');
      } else {
        console.error('[canonicalize] file is NOT in canonical form.');
        process.exit(1);
      }
    } else {
      process.stdout.write(`${canonical}\n`);
    }
  }
}
