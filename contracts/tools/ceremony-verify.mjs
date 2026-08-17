/**
 * ceremony-verify.mjs — OFFLINE ceremony payload verifier (wave-6 S2 design §6 step 2).
 *
 * Zero-dependency by construction: no npm imports, NO network calls, NO file
 * writes. Ships in-repo so the human signer can run it on their own device
 * against the committed payload BEFORE signing. Includes a self-contained
 * Keccak-256 implementation (original Keccak padding 0x01 — NOT NIST SHA-3)
 * because Node's built-in crypto only offers SHA3-256, which is a different
 * function.
 *
 * What it checks (fail-closed — exit 1 on ANY mismatch):
 *   1. payload structure: claim TESTNET (P7), known chainId, pinnedSender
 *      equals the rehearsal pin (P4).
 *   2. P1/P5: re-derives keccak256(tx.data) from the payload's own bytes and
 *      compares against calldataKeccak — the exact bytes-to-sign are the bytes
 *      that were hashed.
 *   3. deploy shape: to == null (contract creation), value == 0x0.
 *   4. P2: re-asserts the decoded block against the frozen constants —
 *      template stage: empty constructorArgs; factory stage: totalFeeBps 175,
 *      bondAmountWei 10000000000000000 (0.01 ETH), bondSink pinned, and the
 *      frozenConstants echo matches the decoded args.
 *
 * Then it prints the human-comparison block (§6: match constants -> payload
 * -> decoded args on one screen) and reminds the signer to compare the
 * signing UI's displayed keccak against calldataKeccak, check the network
 * badge/chainId, and apply the P6 nonce abort rule.
 *
 * Usage: node contracts/tools/ceremony-verify.mjs <path/to/payload.ceremony.json>
 * Exit 0 = all checks PASS (still sign nothing without the manual §6 checklist).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PINNED_SENDER = '0x00e7bE21b70DD57bA2AAC3C32657304dDA6863C2';
const KNOWN_CHAINS = { 'base-sepolia': 84532, 'robinhood-46630': 46630 };
const FROZEN = { totalFeeBps: 175, bondAmountWei: '10000000000000000' };

// ---------------------------------------------------------------------------
// Keccak-256 (original Keccak, domain byte 0x01). Keccak-f[1600] over 64-bit
// lanes as BigInt, explicit theta/rho/pi/chi/iota — clarity over cleverness.
// ---------------------------------------------------------------------------
const MASK64 = 0xffffffffffffffffn;
const RC = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
];
// Rotation offsets r[x][y]; lanes indexed x + 5y.
const R = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];
const rotl = (x, n) => ((x << n) | (x >> (64n - n))) & MASK64;

function keccakF1600(s) {
  for (let round = 0; round < 24; round++) {
    // theta
    const c0 = s[0] ^ s[5] ^ s[10] ^ s[15] ^ s[20];
    const c1 = s[1] ^ s[6] ^ s[11] ^ s[16] ^ s[21];
    const c2 = s[2] ^ s[7] ^ s[12] ^ s[17] ^ s[22];
    const c3 = s[3] ^ s[8] ^ s[13] ^ s[18] ^ s[23];
    const c4 = s[4] ^ s[9] ^ s[14] ^ s[19] ^ s[24];
    const d = [
      c4 ^ rotl(c1, 1n),
      c0 ^ rotl(c2, 1n),
      c1 ^ rotl(c3, 1n),
      c2 ^ rotl(c4, 1n),
      c3 ^ rotl(c0, 1n),
    ];
    for (let y = 0; y < 25; y += 5) {
      s[y] ^= d[0];
      s[y + 1] ^= d[1];
      s[y + 2] ^= d[2];
      s[y + 3] ^= d[3];
      s[y + 4] ^= d[4];
    }
    // rho + pi
    const b = new Array(25);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], BigInt(R[x][y]));
      }
    }
    // chi
    for (let y = 0; y < 25; y += 5) {
      for (let x = 0; x < 5; x++) {
        s[x + y] =
          b[x + y] ^ (~b[((x + 1) % 5) + y] & MASK64 & b[((x + 2) % 5) + y]);
      }
    }
    // iota
    s[0] ^= RC[round];
  }
}

export function keccak256(data) {
  // data: Uint8Array -> '0x…' lowercase hex
  const rate = 136; // 1088-bit rate for keccak-256
  const len = data.length;
  const paddedLen = Math.max(rate, Math.ceil((len + 1) / rate) * rate);
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[len] = 0x01; // original Keccak domain byte (NOT 0x06 / NIST SHA-3)
  padded[paddedLen - 1] |= 0x80;

  const state = new Array(25).fill(0n);
  for (let off = 0; off < paddedLen; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--)
        lane = (lane << 8n) | BigInt(padded[off + i * 8 + b]);
      state[i] ^= lane;
    }
    keccakF1600(state);
  }
  let out = '';
  for (let i = 0; i < 4; i++) {
    let lane = state[i];
    for (let b = 0; b < 8; b++) {
      out += (lane & 0xffn).toString(16).padStart(2, '0');
      lane >>= 8n;
    }
  }
  return '0x' + out;
}

export const keccak256Hex = (hex) => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  // Strict: even-length lowercase hex only. An odd trailing nibble is not
  // representable as bytes — silently dropping it would let a one-nibble
  // tamper hash-verify against the untouched prefix (fail-open). Never.
  if (clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)) {
    throw new Error(`keccak256Hex: malformed hex input (len=${clean.length})`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return keccak256(bytes);
};

// ---------------------------------------------------------------------------
// Verifier
// ---------------------------------------------------------------------------
const HEX64 = /^0x[0-9a-f]{64}$/;
const HEX40 = /^0x[0-9a-fA-F]{40}$/;

export function verify(payload) {
  const failures = [];
  const reject = (why) => failures.push(why);
  const tx = payload.tx ?? {};
  const decoded = payload.decoded ?? {};

  // 1. structure, claim, chain, sender pin
  if (payload.claim !== 'TESTNET')
    reject('claim is not TESTNET (P7 — testnet stamp mandatory)');
  const expectedChainId = KNOWN_CHAINS[payload.chain?.name];
  if (expectedChainId === undefined)
    reject(`unknown chain name: ${payload.chain?.name}`);
  else if (payload.chain.chainId !== expectedChainId)
    reject(`chainId ${payload.chain.chainId} != expected ${expectedChainId}`);
  if (
    (payload.pinnedSender ?? '').toLowerCase() !== PINNED_SENDER.toLowerCase()
  )
    reject('pinnedSender != rehearsal pin (P4)');
  if (!HEX64.test(payload.calldataKeccak ?? ''))
    reject('calldataKeccak malformed');

  // 2. P1/P5 — re-derive the hash from the exact bytes-to-sign
  if (!/^0x(?:[0-9a-f]{2})+$/.test(tx.data ?? ''))
    reject('tx.data is not even-length lowercase hex');
  else {
    const recomputed = keccak256Hex(tx.data);
    if (recomputed !== (payload.calldataKeccak ?? '').toLowerCase()) {
      reject(
        `P1/P5 hash mismatch: keccak256(tx.data)=${recomputed} != calldataKeccak=${payload.calldataKeccak}`,
      );
    }
  }

  // 3. deploy shape
  if (tx.to !== null) reject('tx.to must be null (contract creation)');
  if (tx.value !== '0x0') reject('tx.value must be 0x0');

  // 4. P2 — decoded block vs frozen constants
  const stage =
    tx.kind === 'template-deploy'
      ? 'template'
      : tx.kind === 'factory-deploy'
        ? 'factory'
        : null;
  if (stage === null) reject(`unknown tx.kind: ${tx.kind}`);
  if (decoded.kind !== tx.kind) reject('decoded.kind != tx.kind');
  if (stage === 'template') {
    if (
      !Array.isArray(decoded.constructorArgs) ||
      decoded.constructorArgs.length !== 0
    ) {
      reject('template stage must carry empty constructorArgs');
    }
    if (!HEX64.test(decoded.bytecodeSha256 ?? ''))
      reject('template decoded.bytecodeSha256 malformed');
  } else if (stage === 'factory') {
    const args = decoded.constructorArgs ?? {};
    const fc = payload.frozenConstants ?? {};
    if (args.totalFeeBps !== FROZEN.totalFeeBps)
      reject(
        `decoded totalFeeBps ${args.totalFeeBps} != frozen ${FROZEN.totalFeeBps}`,
      );
    if (args.bondAmountWei !== FROZEN.bondAmountWei)
      reject(
        `decoded bondAmountWei ${args.bondAmountWei} != frozen ${FROZEN.bondAmountWei}`,
      );
    if ((args.bondSink ?? '').toLowerCase() !== PINNED_SENDER.toLowerCase())
      reject('decoded bondSink != pinned rehearsal sink');
    if (!HEX40.test(args.template ?? ''))
      reject('decoded template address malformed');
    if (
      fc.totalFeeBps !== args.totalFeeBps ||
      fc.bondAmountWei !== args.bondAmountWei ||
      (fc.bondSink ?? '').toLowerCase() !== (args.bondSink ?? '').toLowerCase()
    ) {
      reject('frozenConstants echo does not match decoded constructorArgs');
    }
  }

  return { failures, stage, tx, decoded };
}

function report(payload, { failures, stage, tx, decoded }) {
  if (failures.length > 0) {
    console.error('REJECT — ceremony payload FAILED offline verification:');
    for (const f of failures) console.error(`  - ${f}`);
    return 1;
  }

  // Human-comparison block (§6: constants -> payload -> decoded args on one screen)
  console.log('ceremony payload OFFLINE VERIFICATION: PASS');
  console.log('');
  console.log(`  ceremonyId     : ${payload.ceremonyId}`);
  console.log(
    `  claim          : ${payload.claim} — chainId ${payload.chain.chainId} (${payload.chain.name})`,
  );
  console.log(`  releaseTag     : ${payload.releaseTag}`);
  console.log(`  stage          : ${stage}`);
  console.log(`  to             : ${tx.to} (contract creation)`);
  console.log(`  value          : ${tx.value}`);
  console.log(
    `  expectedNonce  : ${payload.expectedNonce} (advisory — wallet nonce at submit is authoritative, P6)`,
  );
  console.log(
    `  predicted addr : ${payload.predictedAddress?.address} (ADVISORY — plain CREATE; receipt is truth)`,
  );
  console.log(`  calldataKeccak : ${payload.calldataKeccak}`);
  if (stage === 'factory') {
    const a = decoded.constructorArgs;
    console.log('  decoded args   :');
    console.log(`    template     : ${a.template}`);
    console.log(
      `    totalFeeBps  : ${a.totalFeeBps}   (frozen echo: ${payload.frozenConstants.totalFeeBps})`,
    );
    console.log(
      `    bondAmountWei: ${a.bondAmountWei}   (frozen echo: ${payload.frozenConstants.bondAmountWei})`,
    );
    console.log(
      `    bondSink     : ${a.bondSink}   (frozen echo: ${payload.frozenConstants.bondSink})`,
    );
  } else {
    console.log(
      `  bytecodeSha256 : ${decoded.bytecodeSha256} (template creation code)`,
    );
  }
  console.log('');
  console.log('BEFORE you confirm in the signing UI:');
  console.log(
    '  1. the UI must show a CONTRACT CREATION with value 0 and the same data;',
  );
  console.log(
    '  2. the displayed keccak of the exact tx object MUST equal calldataKeccak above;',
  );
  console.log(
    '  3. check the network badge — chainId must be the one printed above (P7);',
  );
  console.log(
    '  4. P6 abort rule: if your wallet nonce at submit time != expectedNonce, STOP.',
  );
  console.log(
    'PASS here does NOT replace the §6 reviewer byte-diff — run that too.',
  );
  return 0;
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error(
      'usage: node ceremony-verify.mjs <path/to/payload.ceremony.json>',
    );
    process.exit(1);
  }
  let payload;
  try {
    payload = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`REJECT — cannot read/parse payload: ${err.message}`);
    process.exit(1);
  }
  process.exit(report(payload, verify(payload)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
