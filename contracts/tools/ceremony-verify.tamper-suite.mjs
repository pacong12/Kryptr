/**
 * ceremony-verify.tamper-suite.mjs — adversarial tamper battery for
 * ceremony-verify.mjs (wave-6 S3 outage-approved local work, B3).
 *
 * Zero-dependency, fully offline. Imports the verifier's pure `verify()` and
 * `keccak256Hex`, builds valid template + factory fixtures, then applies a
 * table of mutations. Every REJECT case must produce >= 1 failure; every PASS
 * case must produce zero failures. Exit 0 only when all cases behave.
 *
 * Usage: node contracts/tools/ceremony-verify.tamper-suite.mjs [--quiet]
 *
 * The three CLI cases at the end spawn the verifier as a child process and
 * assert exit code 1 (malformed JSON, missing file, missing argument).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { keccak256Hex, PINNED_SENDER, verify } from './ceremony-verify.mjs';

const QUIET = process.argv.includes('--quiet');
const log = (...a) => {
  if (!QUIET) console.log(...a);
};

const ATTACKER_EOA = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const TEMPLATE_ADDR = '0x1111222233334444555566667777888899990000';
const SHA64 = '0x' + 'a'.repeat(64);

// Plausible-looking creation code (even-length lowercase hex). The verifier
// never interprets it — it only hashes it — so synthetic bytes are fine.
const DATA_TEMPLATE = '0x' + '6080ab40'.repeat(16);
const DATA_FACTORY = '0x' + '6080cd40'.repeat(16) + '0e11'.repeat(8);

function baseTemplate() {
  return {
    ceremonyId: 'base-sepolia-contracts-v0.1.0-template',
    claim: 'TESTNET',
    chain: { name: 'base-sepolia', chainId: 84532 },
    releaseTag: 'contracts-v0.1.0',
    pinnedSender: PINNED_SENDER,
    expectedNonce: '0x0',
    predictedAddress: { address: '0x' + '22'.repeat(20) },
    tx: {
      kind: 'template-deploy',
      to: null,
      value: '0x0',
      data: DATA_TEMPLATE,
    },
    calldataKeccak: keccak256Hex(DATA_TEMPLATE),
    decoded: {
      kind: 'template-deploy',
      constructorArgs: [],
      bytecodeSha256: SHA64,
    },
  };
}

function baseFactory(chainName = 'base-sepolia', chainId = 84532) {
  return {
    ceremonyId: `${chainName}-contracts-v0.1.0-factory`,
    claim: 'TESTNET',
    chain: { name: chainName, chainId },
    releaseTag: 'contracts-v0.1.0',
    pinnedSender: PINNED_SENDER,
    expectedNonce: '0x1',
    predictedAddress: { address: '0x' + '33'.repeat(20) },
    tx: {
      kind: 'factory-deploy',
      to: null,
      value: '0x0',
      data: DATA_FACTORY,
    },
    calldataKeccak: keccak256Hex(DATA_FACTORY),
    decoded: {
      kind: 'factory-deploy',
      constructorArgs: {
        template: TEMPLATE_ADDR,
        totalFeeBps: 175,
        bondAmountWei: '10000000000000000',
        bondSink: PINNED_SENDER,
      },
    },
    frozenConstants: {
      totalFeeBps: 175,
      bondAmountWei: '10000000000000000',
      bondSink: PINNED_SENDER,
    },
  };
}

const clone = (p) => structuredClone(p);

// [name, factory-thunk, expect, why]
const CASES = [
  // ---------------- positives (must PASS) ----------------
  ['T0 template baseline', baseTemplate, 'pass', 'valid payload verifies'],
  ['F0 factory baseline', baseFactory, 'pass', 'valid payload verifies'],
  [
    'F5 bondSink uppercase variant of pin',
    () => {
      const p = baseFactory();
      p.decoded.constructorArgs.bondSink = PINNED_SENDER.toUpperCase();
      p.frozenConstants.bondSink = PINNED_SENDER.toUpperCase();
      return p;
    },
    'pass',
    'bondSink compare is case-insensitive by design',
  ],
  [
    'F9 robinhood chain variant',
    () => baseFactory('robinhood-46630', 46630),
    'pass',
    'robinhood-46630 is a known chain',
  ],
  [
    'T20 pinnedSender case variant',
    () => {
      const p = baseTemplate();
      p.pinnedSender = PINNED_SENDER.toUpperCase();
      return p;
    },
    'pass',
    'pinnedSender compare is case-insensitive',
  ],

  // ---------------- claim / chain / sender ----------------
  [
    'T1 claim MAINNET',
    () => {
      const p = baseTemplate();
      p.claim = 'MAINNET';
      return p;
    },
    'reject',
    'P7 testnet stamp',
  ],
  [
    'T2 claim missing',
    () => {
      const p = baseTemplate();
      delete p.claim;
      return p;
    },
    'reject',
    'missing claim',
  ],
  [
    'T3 unknown chain name',
    () => {
      const p = baseTemplate();
      p.chain.name = 'base-mainnet';
      return p;
    },
    'reject',
    'unknown chain',
  ],
  [
    'T4 chainId / name mismatch',
    () => {
      const p = baseTemplate();
      p.chain.chainId = 8453;
      return p;
    },
    'reject',
    'chainId pin',
  ],
  [
    'T5 attacker pinnedSender',
    () => {
      const p = baseTemplate();
      p.pinnedSender = ATTACKER_EOA;
      return p;
    },
    'reject',
    'P4 sender pin',
  ],

  // ---------------- hash / data bytes ----------------
  [
    'T6 calldataKeccak flipped one hex char',
    () => {
      const p = baseTemplate();
      const h = p.calldataKeccak;
      const flip = h[2] === 'a' ? 'b' : 'a';
      p.calldataKeccak = '0x' + flip + h.slice(3);
      return p;
    },
    'reject',
    'P1/P5 hash mismatch',
  ],
  [
    'T7 calldataKeccak truncated (63 hex)',
    () => {
      const p = baseTemplate();
      p.calldataKeccak = p.calldataKeccak.slice(0, -1);
      return p;
    },
    'reject',
    'malformed hash',
  ],
  [
    'T8 calldataKeccak UPPERCASE',
    () => {
      const p = baseTemplate();
      p.calldataKeccak = p.calldataKeccak.toUpperCase().replace('0X', '0x');
      return p;
    },
    'reject',
    'HEX64 demands lowercase; kit emits lowercase',
  ],
  [
    'T9 tx.data flipped one byte',
    () => {
      const p = baseTemplate();
      p.tx.data = p.tx.data.slice(0, 6) + 'ff' + p.tx.data.slice(8);
      return p;
    },
    'reject',
    'bytes-to-sign changed',
  ],
  [
    'T10 tx.data UPPERCASE',
    () => {
      const p = baseTemplate();
      p.tx.data = p.tx.data.toUpperCase().replace('0X', '0x');
      return p;
    },
    'reject',
    'lowercase-hex rule',
  ],
  [
    'T11 tx.data odd length',
    () => {
      const p = baseTemplate();
      p.tx.data = p.tx.data + '1';
      return p;
    },
    'reject',
    'odd-length hex',
  ],
  [
    'T12 tx.data missing',
    () => {
      const p = baseTemplate();
      delete p.tx.data;
      return p;
    },
    'reject',
    'missing bytes',
  ],

  // ---------------- deploy shape ----------------
  [
    'T13 tx.to set (call disguised as deploy)',
    () => {
      const p = baseTemplate();
      p.tx.to = ATTACKER_EOA;
      return p;
    },
    'reject',
    'contract creation only',
  ],
  [
    'T14 value 0x1',
    () => {
      const p = baseTemplate();
      p.tx.value = '0x1';
      return p;
    },
    'reject',
    'value must be zero',
  ],
  [
    'T15 value non-normalized 0x00',
    () => {
      const p = baseTemplate();
      p.tx.value = '0x00';
      return p;
    },
    'reject',
    'strict value string',
  ],
  [
    'T19 unknown tx.kind',
    () => {
      const p = baseTemplate();
      p.tx.kind = 'proxy-deploy';
      return p;
    },
    'reject',
    'unknown kind',
  ],

  // ---------------- template decoded ----------------
  [
    'T16 template non-empty constructorArgs',
    () => {
      const p = baseTemplate();
      p.decoded.constructorArgs = ['0x1234'];
      return p;
    },
    'reject',
    'template takes no args',
  ],
  [
    'T17 bytecodeSha256 truncated',
    () => {
      const p = baseTemplate();
      p.decoded.bytecodeSha256 = SHA64.slice(0, -1);
      return p;
    },
    'reject',
    'malformed sha256 field',
  ],
  [
    'T18 decoded.kind mismatch',
    () => {
      const p = baseTemplate();
      p.decoded.kind = 'factory-deploy';
      return p;
    },
    'reject',
    'kind consistency',
  ],

  // ---------------- factory decoded ----------------
  [
    'F1 totalFeeBps 176',
    () => {
      const p = baseFactory();
      p.decoded.constructorArgs.totalFeeBps = 176;
      return p;
    },
    'reject',
    'frozen constant',
  ],
  [
    'F2 totalFeeBps type confusion ("175" string)',
    () => {
      const p = baseFactory();
      p.decoded.constructorArgs.totalFeeBps = '175';
      return p;
    },
    'reject',
    'strict equality catches quoted number',
  ],
  [
    'F3 bondAmountWei minus one wei',
    () => {
      const p = baseFactory();
      p.decoded.constructorArgs.bondAmountWei = '9999999999999999';
      return p;
    },
    'reject',
    'frozen bond',
  ],
  [
    'F4 attacker bondSink',
    () => {
      const p = baseFactory();
      p.decoded.constructorArgs.bondSink = ATTACKER_EOA;
      return p;
    },
    'reject',
    'bond drain pin',
  ],
  [
    'F6 template address 38 hex chars',
    () => {
      const p = baseFactory();
      p.decoded.constructorArgs.template = TEMPLATE_ADDR.slice(0, -2);
      return p;
    },
    'reject',
    'malformed address',
  ],
  [
    'F7 frozenConstants echo mismatch',
    () => {
      const p = baseFactory();
      p.frozenConstants.totalFeeBps = 176;
      return p;
    },
    'reject',
    'echo must match decoded',
  ],
  [
    'F8 frozenConstants deleted',
    () => {
      const p = baseFactory();
      delete p.frozenConstants;
      return p;
    },
    'reject',
    'missing echo block',
  ],
];

let failures = 0;
for (const [name, make, expect, why] of CASES) {
  const { failures: vf } = verify(make());
  const got = vf.length === 0 ? 'pass' : 'reject';
  const ok = got === expect;
  if (!ok) failures += 1;
  log(
    `${ok ? 'OK ' : 'BAD'} ${name} — expect ${expect}, got ${got}` +
      (got === 'reject' ? ` [${vf[0]}]` : '') +
      ` (${why})`,
  );
}

// ---------------- CLI-level fail-closed cases ----------------
const here = fileURLToPath(new URL('.', import.meta.url));
const verifier = join(here, 'ceremony-verify.mjs');
const dir = mkdtempSync(join(tmpdir(), 'ceremony-tamper-'));

const cliCases = [
  [
    'C1 malformed JSON',
    () => writeFileSync(join(dir, 'bad.json'), '{not json'),
    ['--', join(dir, 'bad.json')],
  ],
  ['C2 missing file', () => undefined, ['--', join(dir, 'nope.json')]],
  ['C3 missing argument', () => undefined, []],
];

for (const [name, setup, extra] of cliCases) {
  setup();
  const args = [verifier, ...extra.filter((a) => a !== '--')];
  const res = spawnSync(process.execPath, args, { encoding: 'utf8' });
  const ok = res.status === 1;
  if (!ok) failures += 1;
  log(`${ok ? 'OK ' : 'BAD'} ${name} — expect exit 1, got ${res.status}`);
}

const total = CASES.length + cliCases.length;
if (failures > 0) {
  console.error(`TAMPER SUITE: FAIL — ${failures}/${total} cases misbehaved`);
  process.exit(1);
}
console.log(
  `TAMPER SUITE: PASS — ${total}/${total} cases behaved (fail-closed verified)`,
);
