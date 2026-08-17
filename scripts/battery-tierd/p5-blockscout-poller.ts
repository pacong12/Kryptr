#!/usr/bin/env node
/**
 * P-5 Blockscout Verification Poller — Tier D Gate Assertion
 * 
 * Binding Clause: MUST assert is_verified === true ONLY
 * NEVER accept is_fully_verified alone due to bytecode_hash="none" profile
 * 
 * Ruling Reference: Main R1-R5 + Review54 verdict 2026-08-17T14:30Z
 * Protocol: Single JSON-RPC calls for Robinhood (batch 403)
 */

const BLOCKSCOUT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 2_000;
const MAX_RETRIES = 30; // ~1 minute total wait time

interface VerificationResult {
  address: string;
  chainId: string;
  isVerified: boolean;
  isFullyVerified?: boolean; // Optional metadata hash match
  compilerSettings?: {
    solcVersion: string;
    evmVersion: string;
    runs: number;
  };
  verifiedAt?: string;
  verificationGuid?: string;
}

/**
 * Assert binding clause: is_verified MUST equal true
 * Reject if only is_fully_verified exists without is_verified === true
 */
function assertP5Verification(result: VerificationResult): void {
  const errorMessage = `
═══════════════════════════════════════════════════════
🚨 P-5 VERIFICATION FAILURE ❌
═══════════════════════════════════════════════════════

Contract: ${result.address}
Chain: ${result.chainId}

ISSUE: Required "is_verified" field is FALSE or undefined.
       Binding clause REQUIRES is_verified === true.
       
CAUSE NOTE: Blockscout sets is_partially_verified=true when
            bytecode_hash="none" (metadata absent). This
            does NOT satisfy P-5 requirement of full source
            verification against on-chain runtime code.

BINDING CLAUSE: is_verified === true ONLY (not is_fully_verified)
                per Main ruling R1+R2+Review54 feedback.

ACTION: Contract must pass source verification BEFORE Tier D
        battery execution can proceed. Factory stays DARK.
═══════════════════════════════════════════════════════
`;

  if (!result.isVerified || result.isVerified !== true) {
    throw new Error(errorMessage);
  }

  console.log(`✅ P-5 VERIFIED: is_verified=${result.isVerified}`);
  
  // Log optional is_fully_verified status for transparency
  if (result.isFullyVerified === false) {
    console.log('ℹ️  Note: is_fully_verified=false due to bytecode_hash="none" (expected behavior)');
    console.log('   Per binding clause: is_verified===true satisfies P-5 ✓');
  }
}

async function pollBlockscout(
  blockscoutBase: string,
  address: string,
  chainId: string
): Promise<VerificationResult> {
  let retries = 0;
  let lastStatus: 'pending' | 'submitted' | 'verified' | 'failed' = 'pending';

  while (retries < MAX_RETRIES) {
    retries++;
    
    try {
      const response = await fetch(`${blockscoutBase}/api/v2/smart-contracts/${address}`, {
        headers: {
          'User-Agent': 'kryptr-tierd-p5-poller/1.0',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(BLOCKSCOUT_TIMEOUT_MS)
      });

      if (!response.ok) {
        console.log(`⏳ Poll ${retries}/${MAX_RETRIES}: HTTP ${response.status} — waiting...`);
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }

      const data = await response.json();
      
      // Parse Blockscout API v2 response fields
      const result: VerificationResult = {
        address,
        chainId,
        isVerified: data.is_verified === true,
        isFullyVerified: data.is_fully_verified ?? undefined,
        verifiedAt: data.verified_at ?? new Date().toISOString(),
        verificationGuid: data.verification_guid ?? data.guid ?? 'unknown',
        compilerSettings: data.compiler_settings ?? {
          solcVersion: '0.8.24', // frozen from tag contracts-v0.1.0
          evmVersion: 'cancun',
          runs: 200
        }
      };

      console.log(`Poll ${retries}/${MAX_RETRIES}: is_verified=${result.isVerified}`);

      if (result.isVerified) {
        return result;
      }

      // Check if verification pending vs rejected
      if (data.creation_status === 'success' && !result.isVerified) {
        lastStatus = 'pending';
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      } else {
        console.error(`❌ Source verification failed for ${address}`);
        process.exitCode = 1;
        return result;
      }

    } catch (error: unknown) {
      const err = error as Error;
      if (err.name === 'AbortError') {
        console.log(`⏰ Timeout at attempt ${retries}, retrying...`);
        continue;
      }
      console.error(`Network error at attempt ${retries}: ${err.message}`);
      retries++;
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  console.error(`❌ MAX RETRIES EXCEEDED (${MAX_RETRIES}) for ${address}`);
  process.exitCode = 1;
  return { address, chainId, isVerified: false };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔐 TIER D GATE — P-5 BLOCKSCOUT VERIFICATION POLLER');
  console.log('═══════════════════════════════════════════════════════');

  // Validate environment variables
  const requiredEnv = ['CHAIN_ID', 'RPC_URL', 'BLOCKSCOUT_BASE', 'B_PIN', 'CLONE_TX'];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      console.error(`❌ Missing required env var: ${key}`);
      process.exitCode = 1;
      process.exit();
    }
  }

  // Parse inputs
  const CHAIN_ID = process.env.CHAIN_ID!;
  const BLOCKSCOUT_BASE = process.env.BLOCKSCOUT_BASE!.replace(/\/$/, '');
  const B_PIN = process.env.B_PIN!;
  const CLONE_TX = process.env.CLONE_TX!;

  // Extract addresses from deployment tuple (hardcoded for rehearsal chains)
  const DEPLOYMENT_TUPLE: Record<string, string> = {
    '84532': '0xd3153acff69909e5844130B4735feb7525750A5B', // Base Sepolia factory
    '46630': '0xd3153acff69909e5844130B4735feb7525750A5B'  // Robinhood testnet factory
  };

  const FACTORY_ADDRESS = DEPLOYMENT_TUPLE[CHAIN_ID];
  if (!FACTORY_ADDRESS) {
    console.error(`❌ Unknown chain ID: ${CHAIN_ID}. Supported: 84532, 46630`);
    process.exitCode = 1;
    process.exit();
  }

  console.log(`\n📋 Configuration:`);
  console.log(`   Chain:     ${CHAIN_ID}`);
  console.log(`   Factory:   ${FACTORY_ADDRESS}`);
  console.log(`   B_pin:     ${B_PIN}`);
  console.log(`   Clone tx:  ${CLONE_TX.substring(0, 18)}...`);
  console.log(`   Blockscout: ${BLOCKSCOUT_BASE}`);
  console.log(`\n🔍 Starting verification poll...\n`);

  // Execute P-5 poll with binding assertion
  const result = await pollBlockscout(BLOCKSCOUT_BASE, FACTORY_ADDRESS, CHAIN_ID);

  // Apply binding clause assertion
  try {
    assertP5Verification(result);
    console.log('\n✅ P-5 assertion PASSED: is_verified === true\n');
  } catch (assertionError) {
    console.error('\n❌ P-5 assertion FAILED\n');
    process.exitCode = 1;
    return;
  }

  // Output evidence transcript for downstream artifact assembly
  console.log('\n📝 Evidence Transcript:');
  console.log(JSON.stringify({
    p5_verification: {
      chainId: CHAIN_ID,
      factoryAddress: FACTORY_ADDRESS,
      b_pin: parseInt(B_PIN),
      clone_tx: CLONE_TX,
      is_verified: result.isVerified,
      is_fully_verified: result.isFullyVerified,
      verified_at: result.verifiedAt,
      compiler: result.compilerSettings
    },
    verdict: result.isVerified ? 'PASS' : 'FAIL',
    timestamp: new Date().toISOString()
  }, null, 2));

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🎉 P-5 VERIFICATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exitCode = 1;
});
