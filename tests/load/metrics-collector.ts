/**
 * Metrics Collector - Aggregate and report load test results (Task 3.1)
 * 
 * Collects, aggregates, and visualizes performance metrics across all load test scenarios
 * Establishes baselines for production deployment validation
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

interface MetricPoint {
  timestamp: Date;
  responseTime: number;
  throughput: number;
  errorRate: number;
  activeUsers: number;
}

interface BaselineSnapshot {
  scenario: string;
  timestamp: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  totalRequests: number;
  successRate: number;
  throughputRps: number;
  confidenceInterval95: { lower: number; upper: number };
}

class MetricsCollector {
  private metricHistory: MetricPoint[] = [];
  private baselineSnapshots: BaselineSnapshot[] = [];
  private reportDirectory: string = 'tests/load/reports';

  constructor() {
    this.ensureReportDirectory();
    console.log(`\n${colors.cyan}[METRICS COLLECTOR] Initialized${colors.reset}`);
    console.log(`   Report directory: ${this.reportDirectory}\n`);
  }

  private ensureReportDirectory(): void {
    try {
      mkdirSync(this.reportDirectory, { recursive: true });
    } catch (err) {
      console.warn(`⚠️ Could not create report directory: ${err}`);
    }
  }

  /**
   * Record a single metric point
   */
  recordMetric(point: Omit<MetricPoint, 'timestamp'>): void {
    const metric: MetricPoint = {
      ...point,
      timestamp: new Date(),
    };
    
    this.metricHistory.push(metric);
    
    // Keep only last 1000 points for memory efficiency
    if (this.metricHistory.length > 1000) {
      this.metricHistory.shift();
    }
  }

  /**
   * Calculate percentile from sorted array
   */
  private calculatePercentile(sortedData: number[], percentile: number): number {
    if (sortedData.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedData.length) - 1;
    return sortedData[Math.max(0, index)];
  }

  /**
   * Calculate statistical metrics for a time window
   */
  calculateWindowMetrics(windowStart: Date, windowEnd?: Date): BaselineSnapshot {
    const end = windowEnd || new Date();
    
    // Filter points within window
    const filteredPoints = this.metricHistory.filter(p => 
      p.timestamp >= windowStart && p.timestamp <= end
    );
    
    if (filteredPoints.length === 0) {
      throw new Error('No metrics in specified time window');
    }
    
    // Extract response times
    const responseTimes = filteredPoints.map(p => p.responseTime).sort((a, b) => a - b);
    const throughputs = filteredPoints.map(p => p.throughput);
    const errorRates = filteredPoints.map(p => p.errorRate);
    const activeUsers = filteredPoints.map(p => p.activeUsers);
    
    // Calculate percentiles
    const minMs = responseTimes[0];
    const maxMs = responseTimes[responseTimes.length - 1];
    const avgMs = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const p50Ms = this.calculatePercentile(responseTimes, 50);
    const p95Ms = this.calculatePercentile(responseTimes, 95);
    const p99Ms = this.calculatePercentile(responseTimes, 99);
    
    // Calculate throughput stats
    const avgThroughput = throughputs.reduce((a, b) => a + b, 0) / throughputs.length;
    const peakThroughput = Math.max(...throughputs);
    
    // Calculate error rate
    const avgErrorRate = errorRates.reduce((a, b) => a + b, 0) / errorRates.length;
    const successRate = 100 - avgErrorRate;
    
    // Calculate 95% confidence interval for P95 latency
    const ciMargin = this.calculateConfidenceInterval(responseTimes, 0.95);
    
    // Total requests estimation based on average throughput
    const windowDurationSec = (end.getTime() - windowStart.getTime()) / 1000;
    const totalRequests = Math.round(avgThroughput * windowDurationSec);
    
    const snapshot: BaselineSnapshot = {
      scenario: 'current-window',
      timestamp: windowEnd!.toISOString(),
      p50Ms: parseFloat(p50Ms.toFixed(2)),
      p95Ms: parseFloat(p95Ms.toFixed(2)),
      p99Ms: parseFloat(p99Ms.toFixed(2)),
      avgMs: parseFloat(avgMs.toFixed(2)),
      minMs: parseFloat(minMs.toFixed(2)),
      maxMs: parseFloat(maxMs.toFixed(2)),
      totalRequests,
      successRate: parseFloat(successRate.toFixed(4)),
      throughputRps: parseFloat(avgThroughput.toFixed(2)),
      confidenceInterval95: {
        lower: parseFloat((p95Ms - ciMargin.lower).toFixed(2)),
        upper: parseFloat((p95Ms + ciMargin.upper).toFixed(2)),
      },
    };
    
    this.baselineSnapshots.push(snapshot);
    
    return snapshot;
  }

  /**
   * Bootstrap confidence interval calculation
   */
  private calculateConfidenceInterval(data: number[], confidenceLevel: number): {lower: number; upper: number} {
    const n = data.length;
    const bootstrapSamples = 1000;
    const means: number[] = [];
    
    for (let i = 0; i < bootstrapSamples; i++) {
      const sample = [];
      for (let j = 0; j < n; j++) {
        sample.push(data[Math.floor(Math.random() * n)]);
      }
      const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
      means.push(mean);
    }
    
    means.sort((a, b) => a - b);
    const alpha = 1 - confidenceLevel;
    const lowerIdx = Math.floor(alpha / 2 * bootstrapSamples);
    const upperIdx = Math.ceil((1 - alpha / 2) * bootstrapSamples);
    
    return {
      lower: data[lowerIdx],
      upper: data[upperIdx],
    };
  }

  /**
   * Generate comprehensive performance report
   */
  generatePerformanceReport(scenarioName: string, windowStart: Date): Promise<string> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const snapshot = this.calculateWindowMetrics(windowStart);
          
          const report = {
            scenario: scenarioName,
            generatedAt: new Date().toISOString(),
            timeWindow: {
              start: windowStart.toISOString(),
              end: snapshot.timestamp,
            },
            latencyMetrics: {
              min_ms: snapshot.minMs,
              p50_ms: snapshot.p50Ms,
              p95_ms: snapshot.p95Ms,
              p99_ms: snapshot.p99Ms,
              max_ms: snapshot.maxMs,
              avg_ms: snapshot.avgMs,
              ci95_p95: snapshot.confidenceInterval95,
            },
            throughputMetrics: {
              avg_rps: snapshot.throughputRps,
              peak_rps: snapshot.throughputRps * 1.5, // Estimate peak
              total_requests: snapshot.totalRequests,
            },
            reliabilityMetrics: {
              success_rate_percent: snapshot.successRate,
              error_rate_percent: 100 - snapshot.successRate,
            },
            thresholds: {
              target_p95_ms: 200,
              target_p99_ms: 300,
              target_success_rate_percent: 99.9,
            },
            validation: {
              p95_pass: snapshot.p95Ms <= 200,
              p99_pass: snapshot.p99Ms <= 300,
              success_rate_pass: snapshot.successRate >= 99.9,
              overall_pass: snapshot.p95Ms <= 200 && snapshot.p99Ms <= 300 && snapshot.successRate >= 99.9,
            },
          };
          
          // Save to file
          const reportFile = `${this.reportDirectory}/performance-${scenarioName}-${Date.now()}.json`;
          writeFileSync(reportFile, JSON.stringify(report, null, 2));
          
          // Print summary
          this.printSummary(report);
          
          resolve(reportFile);
          
        } catch (error: unknown) {
          reject(error);
        }
      }, 100); // Simulate async operation
    });
  }

  private printSummary(report: any): void {
    console.log(`\n${colors.blue}=== PERFORMANCE REPORT SUMMARY ===${colors.reset}\n`);
    console.log(`Scenario: ${report.scenario}`);
    console.log(`Generated: ${report.generatedAt}\n`);
    
    console.log(`${colors.yellow}Latency Metrics:${colors.reset}`);
    console.log(`   Min:  ${report.latencyMetrics.min_ms}ms`);
    console.log(`   P50:  ${report.latencyMetrics.p50_ms}ms`);
    console.log(`   P95:  ${report.latencyMetrics.p95_ms}ms (${colors.green}${report.validation.p95_pass ? '✅ PASS' : '❌ FAIL'}${colors.reset})`);
    console.log(`   P99:  ${report.latencyMetrics.p99_ms}ms (${colors.green}${report.validation.p99_pass ? '✅ PASS' : '❌ FAIL'}${colors.reset})`);
    console.log(`   Max:  ${report.latencyMetrics.max_ms}ms\n`);
    
    console.log(`${colors.yellow}Throughput:${colors.reset}`);
    console.log(`   Avg:  ${report.throughputMetrics.avg_rps} req/s`);
    console.log(`   Total: ${report.throughputMetrics.total_requests.toLocaleString()} requests\n`);
    
    console.log(`${colors.yellow}Reliability:${colors.reset}`);
    console.log(`   Success Rate: ${report.reliabilityMetrics.success_rate_percent}% (${colors.green}${report.validation.success_rate_pass ? '✅ PASS' : '❌ FAIL'}${colors.reset})\n`);
    
    console.log(`${colors.bold}${report.validation.overall_pass ? '🟢 OVERALL: BOUNDARIES WITHIN LIMITS' : '🔴 OVERALL: THRESHOLD VIOLATIONS DETECTED'}${colors.reset}\n`);
  }

  /**
   * Compare multiple baselines and identify trends
   */
  analyzeTrendComparisons(scenarioNames: string[]): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`\n${colors.cyan}[TREND ANALYSIS] Comparing ${scenarioNames.length} baselines...${colors.reset}`);
        
        const comparisons: any[] = [];
        
        scenarioNames.forEach(name => {
          const files = this.loadBaselineFiles(name);
          if (files.length > 0) {
            comparisons.push({
              scenario: name,
              latest: files[files.length - 1],
              historical: files.slice(0, -1),
            });
          }
        });
        
        writeFileSync(
          `${this.reportDirectory}/trend-analysis-${Date.now()}.json`,
          JSON.stringify(comparisons, null, 2)
        );
        
        this.printTrendSummary(comparisons);
        resolve();
      }, 200);
    });
  }

  private loadBaselineFiles(scenarioName: string): any[] {
    try {
      const files = [
        ...readFileSync(this.reportDirectory, 'utf8').split('\n').filter(f => f.includes(scenarioName)).map(f => 
          JSON.parse(readFileSync(`${this.reportDirectory}/${f}`, 'utf8'))
        ),
      ];
      return files;
    } catch {
      return [];
    }
  }

  private printTrendSummary(comparisons: any[]): void {
    console.log(`\n${colors.cyan}=== TREND COMPARISON ===${colors.reset}\n`);
    
    comparisons.forEach(comp => {
      const latest = comp.latest;
      const historical = comp.historical;
      
      if (historical.length > 0) {
        const oldest = historical[0].latencyMetrics.p95_ms;
        const newest = latest.latencyMetrics.p95_ms;
        const change = ((newest - oldest) / oldest) * 100;
        
        console.log(`${comp.scenario}:`);
        console.log(`   Oldest P95: ${oldest}ms → Latest P95: ${newest}ms`);
        console.log(`   Change: ${change.toFixed(2)}% (${change > 0 ? colors.red : colors.green}${change > 0 ? 'DEGRADED' : 'IMPROVED'}${colors.reset})\n`);
      } else {
        console.log(`${comp.scenario}: Only one baseline available\n`);
      }
    });
  }
}

export default MetricsCollector;
