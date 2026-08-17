#!/usr/bin/env node
/**
 * Tier D P-5 poller: Blockscout API v2 GET /api/v2/smart-contracts/{address}
 * Record is_verified (TRUE), verified_at, compiler_version.
 * Wave-4 pacing: User-Agent + bounded backoff.
 * Contract addresses are hard-coded from S3 rehearsal (read-only):
 *   base-sepolia template: 0xAf816eC9018D2290E711D4e927acc7962702D35B
 *   base-sepolia factory:  0xd3153acff69909e5844130b4735feb7525750a5b
 *   robinhood template:    same address
 *   robinhood factory:     same address
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const env = process.env;
if (!['CHAIN_ID', 'RPC_URL', 'BLOCKSCOUT_BASE'].every(k => k in env)) {
  console.error('Required env vars missing');
  process.exit(1);
}

const BASE = env.BLOCKSCOUT_BASE; // https://base-sepolia.blockscout.com or https://explorer.testnet.chain.robinhood.com
const CONTRACTS = [
  ['0xAf816eC9018D2290E711D4e927acc7962702D35B', 'template'],
  ['0xd3153acff69909e5844130b4735feb7525750a5b', 'factory']
];

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'kryptr-tierd-p5/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function poll(address) {
  let retry = 0;
  while (retry < 5) {
    try {
      const data = await fetchJson(`${BASE}/api/v2/smart-contracts/${address}`);
      return { address, is_verified: !!data.is_verified, verified_at: data.verified_at, compiler: data.compiler_version };
    } catch (e) {
      retry++;
      if (retry === 5) throw e;
      await new Promise(r => setTimeout(r, Math.pow(2, retry) * 1000));
    }
  }
}

(async () => {
  const results = [];
  for (const [addr, label] of CONTRACTS) {
    try {
      const row = await poll(addr);
      row.stage = label;
      results.push(row);
      console.log(`${label}: ${row.is_verified ? 'verified' : 'unverified'} ${JSON.stringify({ verified_at: row.verified_at, compiler: row.compiler })}`);
    } catch (e) {
      results.push({ address: addr, stage: label, error: e.message });
      console.error(`${label}: ERROR`, e.message);
    }
  }
  const evidence = {
    chainId: Number(env.CHAIN_ID),
    bPin: Number(env.B_PIN),
    bClone: Number(env.B_CLONE),
    cloneTx: env.CLONE_TX,
    p5: results,
    verdict: results.every(r => r.is_verified === true) ? 'PASS' : 'FAIL'
  };
  writeFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../tierd-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log('verdict:', evidence.verdict);
})();
