import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // shared-types ships no dist in the worktree; specs need its runtime
      // constants (ORDER_STATUSES, WORKER_ERROR_CODES, …) from source.
      '@kryptr/shared-types': path.resolve(
        import.meta.dirname,
        '../../packages/shared-types/src/index.ts',
      ),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
    // Never scan Next.js build artifacts.
    exclude: ['**/node_modules/**', '.next/**', 'dist/**'],
  },
});
