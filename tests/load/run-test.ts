#!/usr/bin/env node

/**
 * Load Test Runner - CLI Entry Point (Task 3.1)
 * 
 * Executes load test scenarios with configurable parameters:
 * --scenario <name>        Scenario name from tests/load/scenarios/
 * --duration <seconds>     Test duration in seconds
 * --users <count>          Virtual user count
 * --spike-intensity <level>    Spike intensity: low|medium|high
 */

import LoadTestOrchestrator from './orchestrator';
import MetricsCollector from './metrics-collector';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

interface TestOptions {
  scenario: string;
  duration: number;
  users: number;
  spikeIntensity?: string;
  enableCircuitBreaker?: boolean;
  verbose?: boolean;
}

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function parseArgs(): TestOptions {
  const args = process.argv.slice(2);
  
  const options: Partial<TestOptions> = {};
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--scenario':
        options.scenario = args[++i] || 'mainnet-normal';
        break;
      case '--duration':
        options.duration = parseInt(args[++i], 10) || 3600;
        break;
      case '--users':
        options.users = parseInt(args[++i], 10) || 50;
        break;
      case '--spike-intensity':
        options.spikeIntensity = args[++i] || 'low';
        break;
      case '--enable-circuit-breaker':
        options.enableCircuitBreaker = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }
  
  // Default values
  return {
    scenario: options.scenario || 'mainnet-normal',
    duration: options.duration || 3600,
    users: options.users || 50,
    spikeIntensity: options.spikeIntensity || 'low',
    enableCircuitBreaker: options.enableCircuitBreaker || false,
    verbose: options.verbose || false,
  };
}

function printHelp(): void {
  console.log(`
${colors.cyan}=== LOAD TEST RUNNER ===${colors.reset}
Usage: ts-node tests/load/run-test.ts [options]

Options:
  --scenario <name>        Scenario name (default: mainnet-normal)
                         Choices: mainnet-normal, mainnet-peak, mainnet-stress
  
  --duration <seconds>     Test duration in seconds (default: 3600 / 1 hour)
  
  --users <count>          Number of virtual users (default: 50)
  
  --spike-intensity <level>    Spike intensity during peak load (default: low)
                             Choices: low, medium, high
  
  --enable-circuit-breaker   Enable circuit breaker pattern for graceful degradation
  
  --verbose                Enable detailed logging output
  
  --help                   Show this help message

Examples:
  # Run normal load test for 1 hour with default settings
  ts-node tests/load/run-test.ts
  
  # Run peak load test with 100 users for 30 minutes
  ts-node tests/load/run-test.ts --scenario mainnet-peak --duration 1800 --users 100

  # Run stress test with circuit breaker enabled
  ts-node tests/load/run-test.ts --scenario mainnet-stress --enable-circuit-breaker

Environment Variables:
  BASE_URL       Target API endpoint (required)
  API_KEY        Authentication token (optional)
  NODE_ENV       Runtime environment (default: production)
  LOG_LEVEL      Verbose logging level (default: info)

See README.md for complete documentation.
  `);
}

async function main(): Promise<void> {
  const startTime = Date.now();
  const options = parseArgs();
  
  console.log(`${colors.blue}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║      PRODUCTION LOAD TEST RUNNER      ║${colors.reset}`);
  console.log(`${colors.blue}║         Task 3.1: Mainnet Soak Tests  ║${colors.reset}`);
  console.log(`${colors.blue}╚════════════════════════════════════════╝${colors.reset}\n`);
  
  // Validate required environment variables
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  if (!baseUrl) {
    console.error(`${colors.red}ERROR: BASE_URL environment variable is required${colors.reset}`);
    console.error(`Set it before running: export BASE_URL="https://your-api.example.com"`);
    process.exit(1);
  }
  
  console.log(`Test Configuration:`);
  console.log(`   Scenario: ${options.scenario}`);
  console.log(`   Duration: ${options.duration}s (${Math.round(options.duration / 60)} min)`);
  console.log(`   Virtual Users: ${options.users}`);
  console.log(`   Spike Intensity: ${options.spikeIntensity}`);
  console.log(`   Circuit Breaker: ${options.enableCircuitBreaker ? 'Enabled' : 'Disabled'}`);
  console.log(`   Base URL: ${baseUrl}\n`);
  
  try {
    // Load scenario configuration
    const scenarioPath = path.join(process.cwd(), 'tests', 'load', 'scenarios', `${options.scenario}.json`);
    const scenarioConfig = JSON.parse(readFileSync(scenarioPath, 'utf8'));
    
    // Override with command line parameters
    const finalConfig = {
      baseUrl,
      numUsers: options.users,
      rampUpTime: 60, // 60 second ramp-up period
      testDuration: options.duration,
      requestInterval: 1000, // 1 request per second per user base interval
    };
    
    // Handle spike intensity adjustment
    if (options.spikeIntensity === 'high') {
      finalConfig.numUsers = Math.floor(finalConfig.numUsers * 2);
      finalConfig.requestInterval = 500;
    } else if (options.spikeIntensity === 'medium') {
      finalConfig.numUsers = Math.floor(finalConfig.numUsers * 1.5);
      finalConfig.requestInterval = 750;
    }
    
    // Initialize orchestrator and metrics collector
    const orchestrator = new LoadTestOrchestrator(finalConfig);
    const metricsCollector = new MetricsCollector();
    
    console.log(`${colors.yellow}[STARTING]${colors.reset} Load test initiated at ${new Date().toISOString()}\n`);
    
    // Execute test scenario
    const snapshots = await orchestrator.runScenario(options.scenario, scenarioConfig);
    
    // Record real-time metrics
    let totalRequests = 0;
    const intervalMs = options.duration * 1000 / 10; // Collect 10 data points over duration
    const collectionInterval = setInterval(() => {
      totalRequests++;
      const avgLatency = snapshots[snapshots.length - 1]?.avgResponseTime || 0;
      const throughput = snapshots[snapshots.length - 1]?.throughput || 0;
      
      metricsCollector.recordMetric({
        responseTime: avgLatency,
        throughput,
        errorRate: snapshots[snapshots.length - 1]?.errorRate || 0,
        activeUsers: options.users,
      });
      
      // Save checkpoint every 5 intervals
      if (totalRequests % 5 === 0) {
        const reportFile = `${process.cwd()}/tests/load/reports/checkpoint-${Date.now()}.json`;
        writeFileSync(reportFile, JSON.stringify(snapshots, null, 2));
      }
    }, collectionInterval);
    
    // Wait for test duration (already handled by orchestrator, but ensuring completeness)
    await new Promise(resolve => setTimeout(resolve, options.duration * 1000));
    clearInterval(collectionInterval);
    
    // Finalize metrics collection
    console.log(`${colors.green}[COMPLETE]${colors.reset} Test completed successfully\n`);
    
    // Generate comprehensive report
    await metricsCollector.generatePerformanceReport(
      options.scenario,
      new Date(Date.now() - options.duration * 1000)
    );
    
    // Print summary
    orchestrator.generateReport(snapshots);
    
    // Exit with appropriate code based on validation
    const latestSnapshot = snapshots[snapshots.length - 1];
    const p95Pass = latestSnapshot.p95ResponseTime <= 200;
    const errorRatePass = latestSnapshot.errorRate <= 0.1;
    
    if (p95Pass && errorRatePass) {
      console.log(`\n${colors.green}✅ ALL THRESHOLDS PASSED${colors.reset}`);
      process.exit(0);
    } else {
      console.log(`\n${colors.red}❌ THRESHOLD VIOLATIONS DETECTED${colors.reset}`);
      process.exit(1);
    }
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`\n${colors.red}🚨 LOAD TEST FAILED: ${errorMessage}${colors.reset}\n`);
    
    if (options.verbose && error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

// Run main function
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
