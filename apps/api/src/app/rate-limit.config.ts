import { Type } from '@nestjs/common';
import { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Rate limiting configuration for API endpoints
 * Separate limits for public vs authenticated routes
 */
export const RATE_LIMIT_CONFIG: {
  read: ThrottlerModuleOptions;
  write: ThrottlerModuleOptions;
} = {
  // Read operations: 100 requests per minute
  read: {
    ttl: 60000, // 1 minute
    limit: 100, // 100 requests per minute
    ignoreUserAgents: [/^HealthCheck\/.+$/, /^Monitor\/.+$/],
    warningThreshold: 90, // Warn at 90% of limit
  },

  // Write operations: 20 requests per minute  
  write: {
    ttl: 60000, // 1 minute
    limit: 20, // 20 requests per minute
    ignoreUserAgents: [/^HealthCheck\/.+$/, /^Monitor\/.+$/],
    warningThreshold: 15, // Warn at 75% of limit
  },
};

/**
 * Configure rate limiting with different limits based on route metadata
 */
export function configureRateLimiting(authenticatedRoute = false): ThrottlerModuleOptions {
  return authenticatedRoute ? RATE_LIMIT_CONFIG.write : RATE_LIMIT_CONFIG.read;
}
