import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import { builtinRules } from 'eslint/use-at-your-own-risk';

// Equivalent of eslint:recommended, derived from ESLint's own builtin rules
// (swap for `@eslint/js` once that package is approved for the workspace).
const eslintRecommended = Object.fromEntries(
  [...builtinRules.entries()]
    .filter(([, rule]) => rule.meta?.docs?.recommended)
    .map(([ruleId]) => [ruleId, 'error']),
);

export default tseslint.config(
  {
    name: 'kryptr/backoffice/ignores',
    ignores: ['.next/**', 'next-env.d.ts'],
  },
  {
    name: 'kryptr/backoffice/eslint-recommended',
    rules: eslintRecommended,
  },
  ...tseslint.configs.recommended,
  {
    name: 'kryptr/backoffice/rules',
    rules: {
      // Warn-first policy: tighten to "error" once the codebase is clean.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Node globals for CJS config files (next.config.js).
    name: 'kryptr/backoffice/node-config-files',
    files: ['**/*.js', '**/*.cjs', '**/*.cts'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'writable',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      // CJS build config files legitimately use require().
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Keep lint from fighting formatting — prettier's opinions always win.
  prettier,
);
