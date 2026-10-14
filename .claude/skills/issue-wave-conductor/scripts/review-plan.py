#!/usr/bin/env python3
"""review-plan.py <checkout> [--base origin/develop] [--head HEAD] — which reviewers an issue branch triggers.

Reads `git diff <base>...<head>` (file names plus added and removed lines) and prints one JSON line:
  {"ok": true, "code": bool, "ux": "required"|"optional"|false, "flags": {...}, "reasons": {...}}

Rules (conductor skill step 7), keyed to the planned layout in README.md (`apps/studio`, `packages/{core,renderer,
editor,replay,platform-adapter}`, `assets/`):

- **code** (`review-final`): any change except a docs-only diff. Docs-only means at least one Markdown or `docs/`
  file changed and every other changed file is a test or visual baseline (re-pinned by the docs change).
- **ux** (`review-ux`):
  - `required`: a non-test UI source (`.tsx .jsx .vue .svelte .css .html`) under `apps/studio/` or
    `packages/{renderer,editor}/`, an `.svg` under `assets/`, or a changed visual baseline (outside a docs-only diff).
  - `optional`: the conductor decides with a one-line reason. Covers other non-test sources under `apps/studio/`,
    `packages/{renderer,editor,platform-adapter}/` and theme tokens: they can change what a user sees without touching
    a component.
- **flags** (informational; they steer briefs, verification and reviewer tasks — AGENTS.md "Change quality gates"):
  - `schema`: a layout/catalog/topology/mapping JSON under `assets/`, a `*.schema.json`, or a schema source under
    `packages/core/`. Run the asset/schema gates; `schema_without_adr` is set when no `docs/adr/` file changed too
    (a breaking format change needs an ADR first);
  - `replay`: a non-test source under `packages/replay/`, or a changed line naming evidence fidelity
    (`observed|derived|illustrative|unknown` with `fidelity|evidence`). Run the replay gates;
  - `boundary`: a `package.json` changed, `packages/platform-adapter/` changed, or a changed line outside the adapter
    mentions `@ap/` or `analytics-platform`. Tell the code reviewer to check the package boundary first;
  - `instructions`: `.claude/**`, `skills/**`, an `AGENTS.md` or a `CLAUDE.md` changed. Reviewers read these from the
    branch, so the conductor reads that diff before launching anyone.

With the default `--head HEAD`, uncommitted changes outside `.review/` make it exit 2: the review would see code the
plan never saw.
"""
import argparse
import json
import re
import subprocess
import sys


def git(checkout, *args):
    result = subprocess.run(['git', '-C', checkout, *args], text=True, capture_output=True)
    if result.returncode != 0:
        print(json.dumps({'ok': False, 'error': result.stderr.strip() or 'git failed'}))
        sys.exit(2)
    return result.stdout


def is_test(path):
    # Layout fixtures under assets/ are product data (the archetype conformance set), not test support.
    if path.startswith('assets/'):
        return False
    return bool(re.search(r'(__tests__/|\.test\.|\.spec\.|(^|/)tests?/|fixtures/|test-support/)', path))


def is_baseline(path):
    return bool(re.search(r'(^|/)tests?/visual/.*\.png$|__snapshots__/', path))


UI_ROOTS = ('apps/studio/', 'packages/renderer/', 'packages/editor/')
UI_SOURCE = re.compile(r'\.(tsx|jsx|vue|svelte|css|html)$')
UX_OPTIONAL_ROOTS = UI_ROOTS + ('packages/platform-adapter/',)
THEME = re.compile(r'(^|/)(theme|tokens?)(/|\.)', re.I)
SCHEMA_PATH = re.compile(r'^assets/.*\.json$|\.schema\.json$|^packages/core/.*schema', re.I)
FIDELITY_LINE = re.compile(r'\b(observed|derived|illustrative|unknown)\b.*\b(fidelity|evidence)\b'
                           r'|\b(fidelity|evidence)\b.*\b(observed|derived|illustrative|unknown)\b', re.I)
PLATFORM_LINE = re.compile(r'@ap/|analytics-platform')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('checkout')
    parser.add_argument('--base', default='origin/develop')
    parser.add_argument('--head', default='HEAD')
    args = parser.parse_args()

    if args.head == 'HEAD':
        dirty = [line for line in git(args.checkout, 'status', '--porcelain').splitlines()
                 if line[3:] and not line[3:].startswith('.review/')]
        if dirty:
            print(json.dumps({'ok': False, 'error': 'uncommitted changes outside .review/; commit first',
                              'dirty': dirty[:5]}))
            sys.exit(2)

    diff_range = f'{args.base}...{args.head}'
    files = [f for f in git(args.checkout, 'diff', '--name-only', diff_range).splitlines() if f]
    changed = []  # (file, text) for added and removed lines in non-test files
    current = None
    for line in git(args.checkout, 'diff', '--unified=0', diff_range).splitlines():
        if line.startswith('--- '):
            current = line[6:] if line.startswith('--- a/') else None
            continue
        if line.startswith('+++ '):
            if line.startswith('+++ b/'):
                current = line[6:]
            continue
        if line[:1] in '+-' and current is not None and not is_test(current):
            changed.append((current, line[1:].strip()))

    reasons = {'code': [], 'ux': [], 'flags': []}
    flags = {'schema': False, 'schema_without_adr': False, 'replay': False, 'boundary': False,
             'instructions': False}
    substantive = [f for f in files if not is_test(f) and not is_baseline(f)]
    # A test- or baseline-only diff is not docs-only: it still changes what is checked or rendered.
    docs_only = bool(substantive) and all(f.endswith('.md') or f.startswith('docs/') for f in substantive)
    if files and not docs_only:
        reasons['code'].append('code change')

    ux_required, ux_optional = [], []
    for f in files:
        if f.startswith('.claude/') or f.startswith('skills/') or f.endswith(('AGENTS.md', 'CLAUDE.md')):
            flags['instructions'] = True
        if is_test(f) and not is_baseline(f):
            continue
        if SCHEMA_PATH.search(f):
            flags['schema'] = True
            reasons['flags'].append(f'schema: {f}')
        if f.startswith('packages/replay/') and not f.endswith('.md'):
            flags['replay'] = True
            reasons['flags'].append(f'replay: {f}')
        if f.endswith('package.json') or f.startswith('packages/platform-adapter/'):
            flags['boundary'] = True
            reasons['flags'].append(f'boundary: {f}')
        if docs_only:
            continue
        if is_baseline(f):
            ux_required.append(f'visual baseline: {f}')
        elif (f.startswith(UI_ROOTS) and UI_SOURCE.search(f)) or (f.startswith('assets/') and f.endswith('.svg')):
            ux_required.append(f)
        elif (f.startswith(UX_OPTIONAL_ROOTS) or THEME.search(f)) and not f.endswith('.md'):
            ux_optional.append(f)

    for f, text in changed:
        if not flags['replay'] and FIDELITY_LINE.search(text) and not f.endswith('.md'):
            flags['replay'] = True
            reasons['flags'].append(f'replay (evidence fidelity line): {f}')
        if (not flags['boundary'] and PLATFORM_LINE.search(text) and not f.startswith('packages/platform-adapter/')
                and not f.endswith('.md')):
            flags['boundary'] = True
            reasons['flags'].append(f'boundary (platform reference outside the adapter): {f}')
    if flags['schema'] and not any(f.startswith('docs/adr/') for f in files):
        flags['schema_without_adr'] = True

    reasons['ux'] = ux_required or [f'optional: {f}' for f in ux_optional]
    ux = 'required' if ux_required else ('optional' if ux_optional else False)
    for key, values in reasons.items():
        if len(values) > 6:
            reasons[key] = values[:6] + [f'… +{len(values) - 6} more']
    print(json.dumps({
        'ok': True,
        'code': bool(reasons['code']),
        'ux': ux,
        'flags': flags,
        'reasons': reasons,
        'files': len(files),
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
