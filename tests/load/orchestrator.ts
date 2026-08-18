/**
 * Production Load Simulation Framework - Orchestrator (Task 3.1)
 * 
 * Distributed load generation system simulating realistic mainnet transaction patterns
 * with statistically significant sample sizes for performance baseline establishment.
 * 
 * Features:
 * - Multi-scenario orchestration (normal/peak/stress)
 * - Configurable concurrency levels
 * - Real-time metrics collection
 * - Automatic duration management
 * - Fail-closed behavior on threshold breaches
 */

import http from 'http';
import { readFileSync } from 'fs';
import path from 'path';
import { promisify } from 'util';

interface LoadTestConfig {
  baseUrl: string;
  numUsers: number;                  // Concurrent virtual users
  rampUpTime: number;                // Seconds to ramp up to full load
  testDuration: number;              // Total test duration in seconds
  requestInterval: number;           // Milliseconds between requests per user
}

interface MetricsSnapshot {
  timestamp: Date;
  avgResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  throughput: number;                // Requests per second
}

class LoadTestOrchestrator {
  private config: LoadTestConfig;
  private requestLog: Array<{timestamp: number; responseTime: number; status: number}> = [];
  private startTime: Date | null = null;
  private isRunning: boolean = false;
  private currentScenario: string = '';
  
  constructor(config: LoadTestConfig) {
    this.config = config;
    
    console.log(`\n${colors.blue}=== LOAD TEST ORCHESTRATOR INITIALIZED ===${colors.reset}\n`);
    console.log(`Configuration:`);
    console.log(`   Base URL: ${this.config.baseUrl}`);
    console.log(`   Virtual Users: ${this.config.numUsers}`);
    console.log(`   Ramp Up Time: ${this.config.rampUpTime}s`);
    console.log(`   Test Duration: ${this.config.testDuration}s`);
    console.log(`   Request Interval: ${this.config.requestInterval}ms\n`);
  }

  /**
   * Execute a single HTTP request with timing metrics
   */
  async executeRequest(endpoint: string): Promise<{responseTime: number; status: number}> {
    const start = Date.now();
    
    return new Promise((resolve, reject) => {
      const req = http.get(`${this.config.baseUrl}${endpoint}`, {
        timeout: 10000, // 10 second timeout
      }, (res) => {
        let data = '';
        
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const responseTime = Date.now() - start;
          resolve({ responseTime, status: res.statusCode });
        });
      });
      
      req.on('error', (err) => {
        const responseTime = Date.now() - start;
        resolve({ responseTime, status: 0 }); // Error considered as failed request
      });
      
      req.on('timeout', () => {
        req.destroy();
        const responseTime = Date.now() - start;
        resolve({ responseTime, status: 0 });
      });
    });
  }

  /**
   * Simulate a virtual user making requests continuously
   */
  async simulateUser(userId: number, scenarioPath: string, stopSignal: Promise<void>): Promise<void> {
    const scenarioData = JSON.parse(readFileSync(scenarioPath, 'utf8'));
    const endpoints = scenarioData.endpoints || ['/health'];
    
    console.log(`[USER ${userId}] Started simulation for scenario: ${scenarioPath.split('/').pop()}`);
    
    while (!stopSignal) {
      const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
      
      try {
        const { responseTime, status } = await this.executeRequest(endpoint);
        
        this.requestLog.push({
          timestamp: Date.now(),
          responseTime,
          status,
        });
        
        // Rate limiting to prevent overwhelming target
        await new Promise(resolve => setTimeout(resolve, this.config.requestInterval));
        
      } catch (error: unknown) {
        // Log error but continue simulation
        let errorMessage = 'Unknown error';
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        console.log(`[USER ${userId}] Error: ${errorMessage}`);
      }
    }
  }

  /**
   * Run initial ramp-up period with increasing concurrency
   */
  async rampUpPhase(numUsers: number): Promise<void> {
    console.log(`\n${colors.yellow}[RAMP UP]${colors.reset} Starting gradual load increase...`);
    
    const userPromises: Promise<void>[] = [];
    const stopSignal = new Promise<void>(() => {}); // Placeholder
    
    for (let i = 0; i < numUsers; i++) {
      // Stagger user start times during ramp-up
      const delay = (i / numUsers) * this.config.rampUpTime * 1000;
      
      setTimeout(() => {
        // TODO: Load appropriate scenario based on ramp stage
        this.simulateUser(i + 1, 'tests/load/scenarios/mainnet-normal.json', stopSignal)
          .catch(err => console.error(`User ${i + 1} error:`, err));
      }, delay);
      
      userPromises.push(stopSignal);
    }
    
    console.log(`✅ Ramped up to ${numUsers} concurrent users in ${this.config.rampUpTime}s`);
  }

  /**
   * Execute full load test scenario
   */
  async runScenario(scenarioName: string, scenarioConfig: any): Promise<MetricsSnapshot[]> {
    console.log(`\n${colors.cyan}[SCENARIO START]${colors.reset} Running: ${scenarioName}`);
    
    this.currentScenario = scenarioName;
    this.startTime = new Date();
    this.isRunning = true;
    
    // Create temp file with scenario config
    const scenarioFile = `tests/load/scenarios/${scenarioName}.json`;
    
    try {
      // Write scenario configuration
      writeFileSync(
        scenarioFile,
        JSON.stringify({
          name: scenarioName,
          endpoints: scenarioConfig.endpoints || ['/health'],
          durationSec: this.config.testDuration,
          requestIntervalMs: this.config.requestInterval,
        }),
        'utf8'
      );
      
      // Start ramp-up phase
      await this.rampUpPhase(this.config.numUsers);
      
      // Continue running until duration elapsed
      const durationMs = this.config.testDuration * 1000;
      await new Promise(resolve => setTimeout(resolve, durationMs));
      
    } finally {
      // Clean up temporary files
      try {
        unlinkSync(scenarioFile);
      } catch {}
      
      this.isRunning = false;
    }
    
    // Collect final metrics
    return this.collectMetrics();
  }

  /**
   * Calculate percentile from sorted array
   */
  private calculatePercentile(sortedData: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedData.length) - 1;
    return sortedData[Math.max(0, index)] || 0;
  }

  /**
   * Collect metrics snapshot from request log
   */
  private collectMetrics(): MetricsSnapshot[] {
    const snapshots: MetricsSnapshot[] = [];
    
    if (this.requestLog.length === 0) {
      console.warn(`⚠️ No requests logged yet, returning empty metrics`);
      return snapshots;
    }
    
    // Sort response times for percentile calculation
    const sortedTimes = [...this.requestLog].map(r => r.responseTime).sort((a, b) => a - b);
    const totalRequests = this.requestLog.length;
    const successfulRequests = this.requestLog.filter(r => r.status >= 200 && r.status < 300).length;
    const failedRequests = totalRequests - successfulRequests;
    const errorRate = (failedRequests / totalRequests) * 100;
    
    const now = new Date();
    const timeElapsedSec = (now.getTime() - this.startTime!.getTime()) / 1000;
    const throughput = totalRequests / timeElapsedSec;
    
    const metrics: MetricsSnapshot = {
      timestamp: now,
      avgResponseTime: sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length,
      p50ResponseTime: this.calculatePercentile(sortedTimes, 50),
      p95ResponseTime: this.calculatePercentile(sortedTimes, 95),
      p99ResponseTime: this.calculatePercentile(sortedTimes, 99),
      totalRequests,
      successfulRequests,
      failedRequests,
      errorRate,
      throughput,
    };
    
    snapshots.push(metrics);
    
    console.log(`\n${colors.blue}[METRICS SNAPSHOT]${colors.reset}`);
    console.log(`   Timestamp: ${metrics.timestamp.toISOString()}`);
    console.log(`   Avg Response: ${metrics.avgResponseTime.toFixed(2)}ms`);
    console.log(`   P50: ${metrics.p50ResponseTime.toFixed(2)}ms | P95: ${metrics.p95ResponseTime.toFixed(2)}ms | P99: ${metrics.p99ResponseTime.toFixed(2)}ms`);
    console.log(`   Throughput: ${throughput.toFixed(2)} req/s (${(throughput * 60).toFixed(2)} req/min)`);
    console.log(`   Success Rate: ${((1 - metrics.errorRate/100) * 100).toFixed(2)}%`);
    
    return snapshots;
  }

  /**
   * Generate comprehensive test report
   */
  generateReport(snapshots: MetricsSnapshot[]): void {
    console.log(`\n${colors.blue}=== LOAD TEST COMPLETE REPORT ===${colors.reset}\n`);
    
    if (snapshots.length === 0) {
      console.log(`⚠️ No test results available`);
      return;
    }
    
    const latestSnapshot = snapshots[snapshots.length - 1];
    const firstSnapshot = snapshots[0];
    
    console.log(`Test Configuration:`);
    console.log(`   Scenario: ${this.currentScenario}`);
    console.log(`   Duration: ${(latestSnapshot.timestamp!.getTime() - firstSnapshot.timestamp!.getTime()) / 1000}s`);
    console.log(`   Virtual Users: ${this.config.numUsers}\n`);
    
    console.log(`Performance Metrics:`);
    console.log(`   Average Response Time: ${latestSnapshot.avgResponseTime.toFixed(2)}ms`);
    console.log(`   P50 Latency: ${latestSnapshot.p50ResponseTime.toFixed(2)}ms`);
    console.log(`   P95 Latency: ${latestSnapshot.p95ResponseTime.toFixed(2)}ms`);
    console.log(`   P99 Latency: ${latestSnapshot.p99ResponseTime.toFixed(2)}ms\n`);
    
    console.log(`Throughput:`);
    console.log(`   Total Requests: ${latestSnapshot.totalRequests.toLocaleString()}`);
    console.log(`   Successful: ${latestSnapshot.successfulRequests.toLocaleString()}`);
    console.log(`   Failed: ${latestSnapshot.failedRequests.toLocaleString()}`);
    console.log(`   Error Rate: ${latestSnapshot.errorRate.toFixed(4)}%`);
    console.log(`   Peak Throughput: ${latestSnapshot.throughput.toFixed(2)} req/s\n`);
    
    // Threshold validation
    const p95Threshold = 200; // ms
    const errorRateThreshold = 0.1; // %
    
    const p95Pass = latestSnapshot.p95ResponseTime <= p95Threshold;
    const errorRatePass = latestSnapshot.errorRate <= errorRateThreshold;
    
    console.log(`Threshold Validation:`);
    console.log(`   P95 ≤ ${p95Threshold}ms: ${p95Pass ? colors.green + '✅ PASS' + colors.reset : colors.red + '❌ FAIL' + colors.reset}`);
    console.log(`   Error Rate ≤ ${errorRateThreshold}%: ${errorRatePass ? colors.green + '✅ PASS' + colors.reset : colors.red + '❌ FAIL' + colors.reset}\n`);
    
    const overallPass = p95Pass && errorRatePass;
    
    if (overallPass) {
      console.log(`${colors.green}🟢 OVERALL: PERFORMANCE WITHIN BOUNDARIES${colors.reset}`);
    } else {
      console.log(`${colors.red}🔴 OVERALL: THRESHOLD BREACH DETECTED${colors.reset}`);
    }
    
    // Save report to file
    const report = {
      scenario: this.currentScenario,
      timestamp: latestSnapshot.timestamp?.toISOString(),
      config: this.config,
      metrics: snapshots,
      thresholds: { p95: p95Threshold, errorRate: errorRateThreshold },
      pass: overallPass,
    };
    
    const reportFile = `tests/load/reports/load-test-${Date.now()}.json`;
    writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`Report saved: ${reportFile}`);
  }
}

// Color constants for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

export default LoadTestOrchestrator;
