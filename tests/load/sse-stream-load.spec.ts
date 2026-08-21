/**
 * SSE Stream Load Test - Sprint 6 Mainnet Readiness
 * 
 * Simulates 50 concurrent SSE subscribers to validate streaming endpoint performance
 * Response time assertion: < 200ms per event
 */

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';

interface SseEvent {
  intentId: string;
  status: string;
  timestamp: number;
}

interface Metrics {
  totalRequests: number;
  successfulConnections: number;
  failedConnections: number;
  responseTimes: number[];
  eventsReceived: number;
  startTime: number;
  endTime: number;
}

class SseLoadTest {
  private metrics: Metrics;
  private baseUrl: string;
  private concurrency: number;
  
  constructor(baseUrl: string = 'http://localhost:3000', concurrency: number = 50) {
    this.baseUrl = baseUrl;
    this.concurrency = concurrency;
    this.metrics = {
      totalRequests: 0,
      successfulConnections: 0,
      failedConnections: 0,
      responseTimes: [],
      eventsReceived: 0,
      startTime: 0,
      endTime: 0,
    };
  }

  async run(): Promise<Metrics> {
    console.log(`🚀 Starting SSE Load Test with ${this.concurrency} concurrent subscribers...`);
    
    const connections = await Promise.allSettled(
      Array(this.concurrency).fill(null).map(() => this.connectToSse())
    );

    this.metrics.endTime = Date.now();
    this.metrics.totalRequests = this.concurrency;

    connections.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.success) {
        this.metrics.successfulConnections++;
        this.metrics.eventsReceived += result.value.eventCount;
        if (result.value.responseTime > 0) {
          this.metrics.responseTimes.push(result.value.responseTime);
        }
      } else {
        this.metrics.failedConnections++;
      }
    });

    return this.metrics;
  }

  private async connectToSse(): Promise<{ success: boolean; responseTime: number; eventCount: number }> {
    const requestStart = Date.now();
    const intentId = uuidv4();
    const url = `${this.baseUrl}/security/intents/stream?intentId=${intentId}`;
    
    try {
      // Create HTTP connection for SSE
      const req = http.get(url, { timeout: 5000 }, (res) => {
        if (res.statusCode !== 200) {
          throw new Error(`SSE connection failed with status: ${res.statusCode}`);
        }
        
        // Validate SSE headers
        expect(res.headers['content-type']).to.include('text/event-stream');
        expect(res.headers['cache-control']).to.equal('no-cache');
        expect(res.headers['connection']).to.equal('keep-alive');
      });

      // Track first event response time
      let firstEventReceived = false;
      let eventCount = 0;
      
      req.on('response', (res) => {
        if (!firstEventReceived) {
          firstEventReceived = true;
          requestEnd = Date.now();
        }
      });

      // Collect events
      req.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        lines.forEach(line => {
          if (line.startsWith('data:')) {
            eventCount++;
          }
        });
      });

      // Wait for sustained connection
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 2000); // Connect for 2 seconds
      });

      req.destroy();
      
      const responseTime = firstEventReceived ? requestEnd - requestStart : 0;
      
      return {
        success: true,
        responseTime: responseTime,
        eventCount: eventCount
      };

    } catch (error) {
      return {
        success: false,
        responseTime: 0,
        eventCount: 0
      };
    }
  }

  printReport(): void {
    console.log('\n========== SSE LOAD TEST RESULTS ==========');
    console.log(`Concurrency: ${this.concurrency} subscribers`);
    console.log(`Total Requests: ${this.metrics.totalRequests}`);
    console.log(`Successful Connections: ${this.metrics.successfulConnections}/${this.metrics.totalRequests}`);
    console.log(`Failed Connections: ${this.metrics.failedConnections}/${this.metrics.totalRequests}`);
    console.log(`Total Events Received: ${this.metrics.eventsReceived}`);
    console.log(`Test Duration: ${(this.metrics.endTime - this.metrics.startTime)/1000}s`);
    
    if (this.metrics.responseTimes.length > 0) {
      const sortedTimes = [...this.metrics.responseTimes].sort((a, b) => a - b);
      const avg = sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length;
      const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
      const max = sortedTimes[sortedTimes.length - 1] || 0;
      
      console.log(`\nResponse Time Statistics:`);
      console.log(`Average: ${avg.toFixed(2)}ms`);
      console.log(`P95: ${p95.toFixed(2)}ms`);
      console.log(`Max: ${max.toFixed(2)}ms`);
      
      // Assertion check
      const passed = avg < 200 && p95 < 200;
      console.log(`\n✅ RESPONSE TIME ASSERTION: ${passed ? 'PASSED (< 200ms)' : 'FAILED'}`);
      
      if (!passed) {
        throw new Error(`SSE response time exceeds 200ms threshold: avg=${avg.toFixed(2)}ms, p95=${p95.toFixed(2)}ms`);
      }
    }
    
    console.log('===========================================\n');
  }
}

describe('SSE Stream Load Test', function() {
  this.timeout(30000); // 30 second timeout
  
  let sseTest: SseLoadTest;

  before(async () => {
    console.log('🏁 Starting SSE Stream Load Test Suite...');
  });

  after(() => {
    console.log('✅ SSE Stream Load Test Suite Completed');
  });

  it('should handle 50 concurrent SSE subscribers with < 200ms response time', async () => {
    sseTest = new SseLoadTest('http://localhost:3000', 50);
    
    // Run load test
    const results = await sseTest.run();
    
    // Assertions
    expect(results.successfulConnections).to.be.greaterThanOrEqual(40, 'At least 80% of connections should succeed');
    expect(results.eventsReceived).to.be.greaterThan(0, 'Should receive events from SSE stream');
    
    // Response time validation (if data available)
    if (sseTest.metrics.responseTimes.length > 0) {
      const avgResponseTime = sseTest.metrics.responseTimes.reduce((a, b) => a + b, 0) / sseTest.metrics.responseTimes.length;
      expect(avgResponseTime).to.be.lessThan(200, 'Average response time must be under 200ms');
    }
  }).timeout(35000);
});

// Export for direct execution
export default SseLoadTest;
