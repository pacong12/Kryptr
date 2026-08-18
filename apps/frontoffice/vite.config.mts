/// <reference types='vitest' />
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

/**
 * CSP Security Headers for Frontoffice (Wave 7-M7)
 * Strict Content-Security-Policy to prevent XSS and code injection attacks.
 * Pattern aligned with User Docs security-headers.ts implementation.
 */
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

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@': join(__dirname, 'src'),
    },
    conditions: ['@kryptr/source'],
  },
  cacheDir: '../../node_modules/.vite/apps/frontoffice',
  server: {
    port: 4200,
    host: 'localhost',
    headers: FRONTOFFICE_CSP_HEADERS, // Local dev CSP headers
  },
  preview: {
    port: 4300,
    host: 'localhost',
    headers: FRONTOFFICE_CSP_HEADERS, // Preview environment CSP headers
  },
  plugins: [vue(), tailwindcss()],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  buildEnd: async () => {
    // Generate _headers file for Cloudflare Pages / static hosting deployment
    const headersPath = join(__dirname, 'dist', '_headers');
    const headerContent = Object.entries(FRONTOFFICE_CSP_HEADERS)
      .map(([key, value]) => `/*\n  ${key}: ${value}`)
      .join('\n');
    writeFileSync(headersPath, headerContent);
    console.log('✅ Generated _headers file for Cloudflare Pages deployment');
  },
  test: {
    name: '@kryptr/frontoffice',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    // Extended timeout for heavy full-App mounts (SwapPage, WalletOrdersPage, etc.)
    testTimeout: 15_000,
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
});
