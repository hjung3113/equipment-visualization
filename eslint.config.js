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
      // no-restricted-imports does not see dynamic imports (ImportExpression)
      // or TS import types (TSImportType); these selectors close the gap.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/^(@ap|analytics-platform)(\\/|$)/]',
          message:
            "ADR-0001: only packages/platform-adapter may import analytics-platform code ('@ap/*', 'analytics-platform/*').",
        },
        {
          selector: 'TSImportType[source.value=/^(@ap|analytics-platform)(\\/|$)/]',
          message:
            "ADR-0001: only packages/platform-adapter may import analytics-platform code ('@ap/*', 'analytics-platform/*').",
        },
      ],
    },
  },
  {
    // ADR-0008: core and renderer do not know the design system. A flat-config block replaces the
    // rule options above, so the @ap patterns and selectors are repeated here.
    files: ['packages/core/**', 'packages/renderer/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@ap', '@ap/*', 'analytics-platform', 'analytics-platform/*', '@fops', '@fops/*'],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/^(@ap|analytics-platform)(\\/|$)/]',
          message:
            "ADR-0001: only packages/platform-adapter may import analytics-platform code ('@ap/*', 'analytics-platform/*').",
        },
        {
          selector: 'TSImportType[source.value=/^(@ap|analytics-platform)(\\/|$)/]',
          message:
            "ADR-0001: only packages/platform-adapter may import analytics-platform code ('@ap/*', 'analytics-platform/*').",
        },
        {
          selector: 'ImportExpression[source.value=/^@fops(\\/|$)/]',
          message: "ADR-0008: core and renderer do not import the design system ('@fops/*').",
        },
        {
          selector: 'TSImportType[source.value=/^@fops(\\/|$)/]',
          message: "ADR-0008: core and renderer do not import the design system ('@fops/*').",
        },
      ],
    },
  },
  {
    files: ['packages/platform-adapter/**'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.turbo/**',
    'external/**',
    '.claude/**',
    '.review/**',
    'skills/**',
  ]),
]);
