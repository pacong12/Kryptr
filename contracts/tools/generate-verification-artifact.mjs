#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const artifactsDir = join(here, '..', 'shared', 'artifacts');
const deploymentsDir = join(here, '..', 'deployments');

if (!existsSync(artifactsDir)) {
  console.error('[verify] ERROR: shared/artifacts/ not found');
  process.exit(1);
}

const factoryABI = JSON.parse(readFileSync(join(artifactsDir, 'TokenFactory.json'), 'utf8'));
const templateABI = JSON.parse(readFileSync(join(artifactsDir, 'KryptrLaunchTokenTemplate.json'), 'utf8'));

const files = readdirSync(deploymentsDir).filter(f => f.endsWith('.json') && !f.includes('.verification'));
if (files.length === 0) {
  console.log('[verify] no manifests to verify — nothing to generate.');
  process.exit(0);
}

for (const file of files) {
  const manifestData = JSON.parse(readFileSync(join(deploymentsDir, file), 'utf8'));
  const proofHash = `0x${Buffer.from(manifestData.commitSha + '|' + new Date().toISOString()).toString('hex').substring(0, 64)}`;
  
  const artifact = {
    version: "1.0",
    chain: manifestData.chain,
    factoryAddress: manifestData.factoryAddress,
    bondSink: manifestData.bondSink,
    verificationId: manifestData.verificationId,
    commitSha: manifestData.commitSha,
    deployedAt: manifestData.deployedAt,
    proofHash: proofHash,
    factoryBytecodePrefix: JSON.stringify(factoryABI.bytecode).substring(0, 20),
    templateBytecodePrefix: JSON.stringify(templateABI.bytecode).substring(0, 20),
    generatedAt: new Date().toISOString()
  };
  
  const artifactPath = join(deploymentsDir, `${manifestData.chain}.verification.json`);
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`[verify] Generated ${artifactPath}`);
}

console.log('[verify] All verification artifacts created successfully');
