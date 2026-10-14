import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // ADR-0001: only packages/platform-adapter may touch analytics-platform.
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@ap', '@ap/*', 'analytics-platform', 'analytics-platform/*'],
        },
      ],
    },
  },
  {
    files: ['packages/platform-adapter/**'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.turbo/**',
    '.claude/**',
    '.review/**',
    'skills/**',
  ]),
]);
