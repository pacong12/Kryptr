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
    name: 'kryptr/shared-types/ignores',
    ignores: ['dist/**'],
  },
  {
    name: 'kryptr/shared-types/eslint-recommended',
    rules: eslintRecommended,
  },
  ...tseslint.configs.recommended,
  {
    name: 'kryptr/shared-types/rules',
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
  // Keep lint from fighting formatting — prettier's opinions always win.
  prettier,
);
