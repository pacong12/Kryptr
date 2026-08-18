#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Hardcoded path relative to new-contracts root
const rootDir = '/home/muting/kryptr-wt/new-contracts';
const artifactsDir = `${rootDir}/contracts/shared/artifacts`;
const deploymentsDir = `${rootDir}/contracts/deployments`;

console.log('[T21-Chip] Starting verification artifact generation...\n');

if (!existsSync(artifactsDir)) {
  console.error(`[T21-Chip] ERROR: shared/artifacts/ not found at ${artifactsDir}`);
  process.exit(1);
}

const factoryABI = JSON.parse(readFileSync(`${artifactsDir}/TokenFactory.json`, 'utf8'));
const templateABI = JSON.parse(readFileSync(`${artifactsDir}/KryptrLaunchTokenTemplate.json`, 'utf8'));

const factoryBytecode = typeof factoryABI.bytecode === 'string' ? factoryABI.bytecode : JSON.stringify(factoryABI.bytecode);
const templateBytecode = typeof templateABI.bytecode === 'string' ? templateABI.bytecode : JSON.stringify(templateABI.bytecode);

const manifestFiles = readdirSync(deploymentsDir).filter(f => f.endsWith('.json') && !f.includes('.verification') && !f.startsWith('.'));
let processedCount = 0;

for (const file of manifestFiles) {
  const chainName = file.replace('.json', '');
  console.log(`\n📝 Processing: ${file}`);
  
  try {
    const manifestData = JSON.parse(readFileSync(`${deploymentsDir}/${file}`, 'utf8'));
    const requiredFields = ['chain', 'factoryAddress', 'bondSink', 'commitSha'];
    for (const field of requiredFields) if (!manifestData[field]) throw new Error(`Missing: ${field}`);
    
    const timestamp = new Date().toISOString();
    const proofInputs = [manifestData.commitSha, timestamp, manifestData.factoryAddress.toLowerCase(), manifestData.bondSink.toLowerCase(), factoryBytecode.substring(0, 16), templateBytecode.substring(0, 16)].join('|');
    const proofHash = createHash('sha256').update(proofInputs).digest('hex');
    
    const artifact = {
      version: "1.0", specification: "wave-5-t21-chip-verification", chain: manifestData.chain,
      chainId: manifestData.chainId || null, factoryAddress: manifestData.factoryAddress, bondSink: manifestData.bondSink,
      deployedAt: manifestData.deployedAt, blockNumber: manifestData.blockNumber || null, verificationId: manifestData.verificationId,
      commitSha: manifestData.commitSha, proofHash: `0x${proofHash}`,
      factoryBytecodePrefix: factoryBytecode.substring(0, 16), templateBytecodePrefix: templateBytecode.substring(0, 16),
      generatedAt: timestamp, generatedBy: "@auditor-contracts", toolsVersion: "sprint-3-mainnet-deploy"
    };
    
    writeFileSync(`${deploymentsDir}/${chainName}.verification.json`, JSON.stringify(artifact, null, 2), 'utf8');
    console.log(`✅ Generated: ${chainName}.verification.json | Proof: ${artifact.proofHash}\n`);
    processedCount++;
  } catch (error) {
    console.error(`❌ Error processing ${file}: ${error.message}`);
  }
}

if (processedCount === 0) { console.log('\n[T21-Chip] No manifests processed.'); process.exit(1); }
console.log(`═══════════════════════════ [T21-Chip] ✓ ${processedCount} artifact(s) generated ════════════════════════════\n`);
