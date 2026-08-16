/// <reference types='vitest' />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig(() => ({
  root: import.meta.dirname,
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    // Resolve @kryptr/* workspace packages to their TS source (matches
    // tsconfig customConditions); avoids depending on a built dist.
    conditions: ['@kryptr/source'],
  },
  cacheDir: '../../node_modules/.vite/apps/frontoffice',
  server: {
    port: 4200,
    host: 'localhost',
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
  plugins: [vue(), tailwindcss()],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [],
  // },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: '@kryptr/frontoffice',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    // Heavy full-App jsdom mounts (SwapPage/WalletOrdersPage/WalletDetailPage)
    // exceed vitest's 5s default under full-suite parallel load, causing
    // timeout flakes in CI. This is a ceiling only — fast tests are unaffected.
    testTimeout: 15_000,
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
