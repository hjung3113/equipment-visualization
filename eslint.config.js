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
            "ADR-0001, ADR-0008, ADR-0013: only packages/platform-adapter may import analytics-platform code ('@ap/*', which includes the design system '@ap/ui', and 'analytics-platform/*').",
        },
        {
          selector: 'TSImportType[source.value=/^(@ap|analytics-platform)(\\/|$)/]',
          message:
            "ADR-0001, ADR-0008, ADR-0013: only packages/platform-adapter may import analytics-platform code ('@ap/*', which includes the design system '@ap/ui', and 'analytics-platform/*').",
        },
      ],
    },
  },
  {
    // ADR-0013: the DOM UI packages and Studio consume the design system '@ap/ui' and nothing else from the platform SDK.
    // A flat-config block replaces the rule options above, so the patterns and selectors are repeated with the '@ap/ui' exception.
    files: ['packages/ui/**', 'packages/replay/**', 'packages/editor/**', 'packages/views/**', 'apps/studio/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ regex: '^(@ap(/(?!ui(/|$))|$)|analytics-platform(/|$))' }],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/^(@ap(\\/(?!ui(\\/|$))|$)|analytics-platform(\\/|$))/]',
          message:
            "ADR-0001, ADR-0013: only '@ap/ui' (the design system) may be imported from the platform SDK outside packages/platform-adapter.",
        },
        {
          selector: 'TSImportType[source.value=/^(@ap(\\/(?!ui(\\/|$))|$)|analytics-platform(\\/|$))/]',
          message:
            "ADR-0001, ADR-0013: only '@ap/ui' (the design system) may be imported from the platform SDK outside packages/platform-adapter.",
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
          patterns: ['@ap', '@ap/*', 'analytics-platform', 'analytics-platform/*', '@eqv/ui', '@eqv/ui/*'],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/^(@ap|analytics-platform)(\\/|$)/]',
          message:
            "ADR-0001, ADR-0008, ADR-0013: only packages/platform-adapter may import analytics-platform code ('@ap/*', which includes the design system '@ap/ui', and 'analytics-platform/*').",
        },
        {
          selector: 'TSImportType[source.value=/^(@ap|analytics-platform)(\\/|$)/]',
          message:
            "ADR-0001, ADR-0008, ADR-0013: only packages/platform-adapter may import analytics-platform code ('@ap/*', which includes the design system '@ap/ui', and 'analytics-platform/*').",
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
    // ADR-0012, ADR-0013: the host module imports only the SDK's '@ap/contracts' and the design system '@ap/ui' (AP's hostModule preset).
    files: ['packages/platform-adapter/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ regex: '^(@ap(/(?!(contracts|ui)(/|$))|$)|analytics-platform(/|$))' }],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/^(@ap(\\/(?!(contracts|ui)(\\/|$))|$)|analytics-platform(\\/|$))/]',
          message:
            "ADR-0012, ADR-0013: packages/platform-adapter may import only '@ap/contracts' and '@ap/ui' from the platform SDK.",
        },
        {
          selector: 'TSImportType[source.value=/^(@ap(\\/(?!(contracts|ui)(\\/|$))|$)|analytics-platform(\\/|$))/]',
          message:
            "ADR-0012, ADR-0013: packages/platform-adapter may import only '@ap/contracts' and '@ap/ui' from the platform SDK.",
        },
      ],
    },
  },
  {
    files: ['packages/ui/src/**/*.tsx', 'packages/replay/src/**/*.tsx', 'packages/editor/src/**/*.tsx', 'packages/views/src/**/*.tsx', 'packages/platform-adapter/src/**/*.tsx', 'apps/studio/src/**/*.tsx'],
    plugins: { shadcn },
    settings: {
      shadcn: {
        componentImports: ['^@ap/ui(/|$)', '^@eqv/ui(/|$)'],
        note: 'ADR-0008, ADR-0013: use @ap/ui primitives and platform tokens; a pattern @ap/ui lacks gets an EV component first.',
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
  {
    // #73 slice f1: AP wraps the @ap/ui TabsList/TabsTrigger the same way (underline tabs); roles, selection and keyboard stay @ap/ui's.
    files: ['packages/ui/src/Tabs.tsx'],
    rules: { 'shadcn/no-restyle': 'off' },
  },
  {
    // #113: the virtualizer's runtime geometry (spacer-row heights, measured row offsets) needs `style`; AP's PlatformDataTable does the same. Only geometry, never colours or spacing tokens.
    files: ['packages/ui/src/DataTable.tsx'],
    rules: { 'shadcn/no-inline-styles': 'off' },
  },
  {
    // ADR-0014: Node scripts (pack, consumer check, finalize) run under Node and read `process`.
    files: ['tooling/scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly' } },
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
