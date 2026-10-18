import js from '@eslint/js';
import { plugin as shadcn } from '@shadcn/lint';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

// ADR-0008: design-system rules (@shadcn/lint) for the packages that draw DOM UI. The options mirror
// FeedbackOps' .oxlintrc.json (FeedbackOps ADR-0062), copied as analytics-platform does in
// tooling/eslint/src/index.js: screens add only layout to a component, containers also spacing, the 50px
// headers never a height. The theme is the Studio Tailwind entry named by the root components.json. Findings
// eslint-suppressions.json is empty and must stay so: no new design-lint suppressions.
// core and renderer stay design-system-free (SVG reads only --eqv-*), so they are not in scope.
const RESTYLE_CONTRACTS = [
  {
    pattern: '^(Card|EmptyState|PanelTitleBlock|ListToolbar)$|(Content|Header|Footer|Group|Panel|List|SectionTitle)$',
    allow: ['layout', 'spacing'],
  },
  {
    pattern:
      '^(TabsList|ToggleGroup|RadioGroup|DialogFooter|AlertDialogFooter|TooltipContent|SelectContent|DropdownMenuContent|DropdownMenuSubContent|PopoverContent|HoverCardContent)$',
    allow: ['layout'],
  },
  {
    pattern: '^(DetailPanelHeader|ShellHeader|ListToolbar)$',
    allow: ['layout', 'spacing'],
    deny: ['h-*', 'min-h-*', 'max-h-*', 'size-*'],
  },
];

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
          patterns: ['@ap', '@ap/*', 'analytics-platform', 'analytics-platform/*', '@fops', '@fops/*', '@eqv/ui', '@eqv/ui/*'],
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
        {
          selector: 'ImportExpression[source.value=/^@eqv\\/ui(\\/|$)/]',
          message: "ADR-0008: core and renderer do not import the EV components ('@eqv/ui').",
        },
        {
          selector: 'TSImportType[source.value=/^@eqv\\/ui(\\/|$)/]',
          message: "ADR-0008: core and renderer do not import the EV components ('@eqv/ui').",
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
  {
    files: ['packages/ui/src/**/*.tsx', 'packages/replay/src/**/*.tsx', 'packages/editor/src/**/*.tsx', 'apps/studio/src/**/*.tsx'],
    plugins: { shadcn },
    settings: {
      shadcn: {
        componentImports: ['^@fops/ui(/|$)', '^@eqv/ui(/|$)'],
        note: 'ADR-0008: use @fops/ui primitives and FeedbackOps tokens; a pattern @fops/ui lacks gets an EV component first.',
      },
    },
    rules: {
      'shadcn/no-restyle': ['error', { allow: ['layout'], contracts: RESTYLE_CONTRACTS }],
      'shadcn/no-raw-colors': ['error', { scanAllStrings: true }],
      'shadcn/no-arbitrary-values': ['error', { allow: ['layout'], scanAllStrings: true }],
      'shadcn/no-inline-styles': 'error',
      'shadcn/no-unknown-classes': 'error',
      'shadcn/require-static-classes': 'error',
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
