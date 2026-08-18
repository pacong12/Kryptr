/**
 * Load Test Comparison Report Generator (Task 3.1)
 * 
 * Generates comprehensive markdown reports comparing multiple load test runs
 * Identifies performance regressions and establishes baselines
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';

interface TestResult {
  scenario: string;
  timestamp: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
  throughputRps: number;
  pass: boolean;
}

class ComparisonReportGenerator {
  private reportDirectory = 'tests/load/reports';
  private baselineData: Map<string, TestResult[]> = new Map();

  generateComparison(): string {
    console.log(`\n${colors.blue}[COMPARISON GENERATOR] Collecting all test results...${colors.reset}\n`);
    
    // Load all available test reports
    const files = readdirSync(this.reportDirectory).filter(f => 
      f.endsWith('.json') && !f.includes('checkpoints')
    );
    
    console.log(`Found ${files.length} test result files\n`);
    
    // Parse each file into structured data
    const allResults: TestResult[] = [];
    files.forEach(file => {
      try {
        const content = readFileSync(path.join(this.reportDirectory, file), 'utf8');
        const data = JSON.parse(content);
        
        if (data.metrics && data.metrics.length > 0) {
          const latestMetrics = data.metrics[data.metrics.length - 1];
          
          const result: TestResult = {
            scenario: data.scenario || 'unknown',
            timestamp: data.timestamp || '',
            p50Ms: latestMetrics.p50ResponseTime || 0,
            p95Ms: latestMetrics.p95ResponseTime || 0,
            p99Ms: latestMetrics.p99ResponseTime || 0,
            errorRate: latestMetrics.errorRate || 0,
            throughputRps: latestMetrics.throughput || 0,
            pass: data.validation?.overall_pass || false,
          };
          
          allResults.push(result);
          
          // Group by scenario for trend analysis
          const scenarioKey = result.scenario;
          if (!this.baselineData.has(scenarioKey)) {
            this.baselineData.set(scenarioKey, []);
          }
          this.baselineData.get(scenarioKey)!.push(result);
        }
      } catch (err) {
        console.warn(`⚠️ Could not parse ${file}: ${err}`);
      }
    });
    
    // Generate comparison markdown
    const markdown = this.generateMarkdown(allResults);
    
    // Save to file
    const reportFile = `${this.reportDirectory}/comparison-${Date.now()}.md`;
    writeFileSync(reportFile, markdown);
    
    console.log(`✅ Comparison report generated: ${reportFile}\n`);
    
    return markdown;
  }

  private generateMarkdown(results: TestResult[]): string {
    let md = `# Load Test Comparison Report\n\n`;
    md += `**Generated**: ${new Date().toISOString()}\n`;
    md += `**Scope**: All test results in \`tests/load/reports/\`\n\n`;
    
    // Summary Table
    md += `## Executive Summary\n\n`;
    md += `| Scenario | P50 (ms) | P95 (ms) | P99 (ms) | Error Rate | Throughput (req/s) | Status |\n`;
    md += `|----------|----------|----------|----------|------------|-------------------|--------|\n`;
    
    results.forEach(r => {
      const status = r.pass ? '✅' : '❌';
      md += `| ${r.scenario} | ${r.p50Ms.toFixed(2)} | ${r.p95Ms.toFixed(2)} | ${r.p99Ms.toFixed(2)} | ${r.errorRate.toFixed(4)}% | ${r.throughputRps.toFixed(2)} | ${status} |\n`;
    });
    
    md += `\n`;
    
    // Trend Analysis per Scenario
    md += `## Performance Trends by Scenario\n\n`;
    
    this.baselineData.forEach((resultsByScenario, scenarioName) => {
      if (resultsByScenario.length < 1) return;
      
      md += `### 📊 ${scenarioName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n\n`;
      
      // Sort by timestamp ascending
      const sortedResults = [...resultsByScenario].sort((a, b) => 
        a.timestamp.localeCompare(b.timestamp)
      );
      
      // Show timeline
      md += `**Timeline:**\n`;
      sortedResults.forEach((r, i) => {
        const isLatest = i === sortedResults.length - 1;
        const arrow = isLatest ? ' → ' : ' → ';
        const timestamp = r.timestamp.split('T')[0];
        md += `${arrow} ${timestamp}: P95=${r.p95Ms.toFixed(2)}ms | Error=${r.errorRate.toFixed(4)}%\n`;
      });
      
      md += `\n`;
      
      // Baseline vs Latest comparison
      if (sortedResults.length >= 2) {
        const first = sortedResults[0];
        const latest = sortedResults[sortedResults.length - 1];
        
        const p95Change = ((latest.p95Ms - first.p95Ms) / first.p95Ms) * 100;
        const errorChange = ((latest.errorRate - first.errorRate) / (first.errorRate || 0.1)) * 100;
        
        const p95Trend = p95Change > 0 ? colors.red + 'DEGRADED' + colors.reset : 
                        p95Change < -5 ? colors.green + 'IMPROVED' + colors.reset : 'STABLE';
        
        md += `**Change Since First Run:**\n`;
        md += `- P95 Latency: ${p95Change.toFixed(2)}% (${p95Trend})\n`;
        md += `- Error Rate: ${errorChange.toFixed(2)}% (${errorChange > 0 ? colors.red + 'WORSE' + colors.reset : colors.green + 'BETTER' + colors.reset})\n\n`;
      } else {
        md += `*Only one test run available for this scenario*\n\n`;
      }
      
      // Threshold validation
      const thresholdP95 = 200;
      const thresholdError = 0.1;
      
      const p95Status = latest.p95Ms <= thresholdP95 ? '✅ PASS' : `❌ FAIL (> ${thresholdP95}ms)`;
      const errorStatus = latest.errorRate <= thresholdError ? '✅ PASS' : `❌ FAIL (> ${thresholdError}%)`;
      
      md += `**Threshold Validation:**\n`;
      md += `- P95 ≤ ${thresholdP95}ms: ${p95Status}\n`;
      md += `- Error Rate ≤ ${thresholdError}%: ${errorStatus}\n\n`;
    });
    
    // Overall Assessment
    md += `## Overall System Health Assessment\n\n`;
    
    const allPass = results.every(r => r.pass);
    const avgP95 = results.reduce((sum, r) => sum + r.p95Ms, 0) / results.length;
    const avgErrorRate = results.reduce((sum, r) => sum + r.errorRate, 0) / results.length;
    
    md += `**Current State:** ${allPass ? colors.green + '🟢 OPERATIONAL ✅' + colors.reset : colors.red + '🔴 NEEDS ATTENTION ❌' + colors.reset}\n\n`;
    md += `- Average P95 Latency: **${avgP95.toFixed(2)}ms** (Target: ≤200ms)\n`;
    md += `- Average Error Rate: **${avgErrorRate.toFixed(4)}%** (Target: ≤0.1%)\n\n`;
    
    if (!allPass) {
      md += `${colors.red}⚠️ PERFORMANCE DEGRADATION DETECTED${colors.reset}\n`;
      md += `Review failed scenarios and address root cause before production deployment.\n\n`;
    }
    
    // Recommendations
    md += `## Recommendations\n\n`;
    
    if (allPass) {
      md += `✅ **GREEN LIGHT** - All thresholds met, ready for:\n`;
      md += `   - Production deployment\n`;
      md += `   - User acceptance testing\n`;
      md += `   - Load scaling to higher traffic levels\n`;
    } else {
      md += `🚨 **RED FLAGS** - Address before proceeding:\n`;
      md += `   - Investigate high-latency endpoints (priority)\n`;
      md += `   - Review error logs for recurring issues\n`;
      md += `   - Consider circuit breaker configuration adjustments\n`;
      md += `   - Validate database connection pool sizing\n`;
    }
    
    md += `\n---\n`;
    md += `*Report generated automatically by `generate-comparison.ts`\n`;
    md += `*For detailed metrics, refer to individual JSON reports in `tests/load/reports/`\n`;
    
    return md;
  }
  
  printSummary(markdown: string): void {
    console.log(`\n${colors.cyan}=== COMPARISON SUMMARY ===${colors.reset}\n`);
    
    // Extract key metrics from markdown
    const lines = markdown.split('\n');
    const summaryStart = lines.findIndex(l => l.includes('## Executive Summary'));
    const nextSection = lines.findIndex((l, i) => i > summaryStart && l.startsWith('## ') && l !== lines[summaryStart]);
    
    const summaryBlock = nextSection > 0 
      ? lines.slice(summaryStart, nextSection).join('\n')
      : lines.slice(summaryStart).join('\n');
    
    console.log(summaryBlock);
  }
}

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Execute main function
const generator = new ComparisonReportGenerator();
const markdown = generator.generateComparison();
generator.printSummary(markdown);

console.log(`\n${colors.green}✅ Report generation complete${colors.reset}\n`);
