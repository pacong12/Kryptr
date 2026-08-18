#!/usr/bin/env node
/**
 * Generate Cloudflare Pages _headers file for CSP security
 * (Wave 7-M7) - Security headers deployment script
 */

const { writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');

const __dirname = process.cwd();

const FRONTOFFICE_CSP_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.kryptr.test; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; upgrade-insecure-requests",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy':
    'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'X-Frame-Options': 'DENY',
};

// Create dist directory if it doesn't exist
const distDir = join(__dirname, 'dist');
try {
  mkdirSync(distDir, { recursive: true });
} catch (e) {
  // Directory already exists, ignore
}

// Generate _headers file content
const headerContent = Object.entries(FRONTOFFICE_CSP_HEADERS)
  .map(([key, value]) => `/*\n  ${key}: ${value}`)
  .join('\n');

const headersPath = join(distDir, '_headers');
writeFileSync(headersPath, headerContent);

console.log(`✅ Generated _headers file at: ${headersPath}`);
console.log(`📋 Content preview:\n${headerContent.substring(0, 200)}...`);
