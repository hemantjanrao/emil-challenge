// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Globally ignored paths
  {
    ignores: ['node_modules/**', 'playwright-report/**', 'test-results/**'],
  },

  // Base JS recommended rules
  eslint.configs.recommended,

  // TypeScript rules for all .ts files
  ...tseslint.configs.recommendedTypeChecked,

  // Project-wide overrides
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow console in mock server and test helpers
      'no-console': 'warn',
      // Playwright uses void-returning async callbacks
      '@typescript-eslint/no-floating-promises': 'error',
      // Common in test files — relax
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Relax rules for plain JS files (mock-server.js uses CommonJS)
  {
    files: ['*.js', '**/*.js'],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
