#!/usr/bin/env python3
"""Table test for review-plan.py on a throwaway git repo (no network, no worktree)."""
import json, subprocess, sys, tempfile
from pathlib import Path

PLAN = Path(__file__).resolve().parent / 'review-plan.py'


def sh(repo, *args):
    subprocess.run(['git', '-C', str(repo), *args], check=True, capture_output=True)


def write(repo, path, text):
    target = Path(repo) / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)


def plan(repo, *extra):
    r = subprocess.run([sys.executable, str(PLAN), str(repo), *extra], capture_output=True, text=True)
    return r.returncode, json.loads(r.stdout.strip().splitlines()[-1])


BASE_FILES = {
    'docs/DESIGN-v0.4.md': '# Design\n',
    'apps/studio/src/App.tsx': 'export const App = () => null;\n',
    'apps/studio/src/state.ts': 'export const s = 1;\n',
    'packages/core/src/layout-schema.ts': 'export const v = 1;\n',
    'packages/replay/src/reducer.ts': 'export const reduce = () => 1;\n',
    'packages/renderer/src/render.ts': 'export const r = 1;\n',
    'packages/platform-adapter/src/index.ts': 'export const a = 1;\n',
    'assets/templates/single-hub.layout.json': '{}\n',
    'assets/templates/single-hub.svg': '<svg/>\n',
}

CASES = [
    # name, {path: new text}, expected subset
    ('docs only', {'docs/DESIGN-v0.4.md': '# Design\nmore\n'}, {'code': False, 'ux': False}),
    ('docs + re-pinned test', {'docs/DESIGN-v0.4.md': '# Design\nx\n',
                               'apps/studio/src/__tests__/App.test.tsx': "it('x', () => {});\n"},
     {'code': False, 'ux': False}),
    ('studio tsx', {'apps/studio/src/App.tsx': 'export const App = () => <div />;\n'},
     {'code': True, 'ux': 'required'}),
    ('studio .ts only', {'apps/studio/src/state.ts': 'export const s = 2;\n'}, {'code': True, 'ux': 'optional'}),
    ('renderer .ts', {'packages/renderer/src/render.ts': 'export const r = 2;\n'}, {'ux': 'optional'}),
    ('asset svg', {'assets/templates/single-hub.svg': '<svg viewBox="0 0 1 1"/>\n'}, {'ux': 'required'}),
    ('visual baseline only', {'apps/studio/tests/visual/single-hub.png': 'png'}, {'code': True, 'ux': 'required'}),
    ('docs + baseline', {'docs/DESIGN-v0.4.md': '# Design\ny\n', 'apps/studio/tests/visual/a.png': 'png'},
     {'code': False, 'ux': False}),
    ('layout json without ADR', {'assets/templates/single-hub.layout.json': '{"v":2}\n'},
     {'code': True, 'flags.schema': True, 'flags.schema_without_adr': True}),
    ('layout fixture json', {'assets/fixtures/multi-hub.layout.json': '{}\n'}, {'flags.schema': True}),
    ('core schema with ADR', {'packages/core/src/layout-schema.ts': 'export const v = 2;\n',
                              'docs/adr/0001-layout-v2.md': '# ADR\n'},
     {'flags.schema': True, 'flags.schema_without_adr': False}),
    ('replay reducer', {'packages/replay/src/reducer.ts': 'export const reduce = () => 2;\n'},
     {'flags.replay': True, 'ux': False}),
    ('fidelity line elsewhere', {'apps/studio/src/state.ts': "export const evidence = 'illustrative';\n"},
     {'flags.replay': True}),
    ('replay test only', {'packages/replay/src/__tests__/reducer.test.ts': "it('x', () => {});\n"},
     {'flags.replay': False}),
    ('platform import outside adapter', {'packages/renderer/src/render.ts': "import { x } from '@ap/kernel';\n"},
     {'flags.boundary': True}),
    ('adapter change', {'packages/platform-adapter/src/index.ts': "import { x } from '@ap/kernel';\n"},
     {'flags.boundary': True, 'ux': 'optional'}),
    ('package.json', {'packages/core/package.json': '{"name":"core"}\n'}, {'flags.boundary': True}),
    ('agent instructions', {'.claude/agents/review-ux.md': '---\nname: review-ux\n---\n'},
     {'flags.instructions': True}),
    ('repo skill', {'skills/reference-to-semantic-topview/SKILL.md': '# s\n'},
     {'flags.instructions': True, 'code': False}),
]


def get(obj, dotted):
    for part in dotted.split('.'):
        obj = obj[part]
    return obj


failures = 0
with tempfile.TemporaryDirectory() as tmp:
    repo = Path(tmp)
    sh(repo, 'init', '-q', '-b', 'main')
    sh(repo, 'config', 'user.email', 't@t'); sh(repo, 'config', 'user.name', 't')
    for path, text in BASE_FILES.items():
        write(repo, path, text)
    sh(repo, 'add', '-A'); sh(repo, 'commit', '-qm', 'base')
    base = subprocess.run(['git', '-C', str(repo), 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
    for name, edits, expected in CASES:
        sh(repo, 'checkout', '-q', '--detach', base)
        for path, text in edits.items():
            write(repo, path, text)
        sh(repo, 'add', '-A'); sh(repo, 'commit', '-qm', name)
        code, out = plan(repo, '--base', base)
        for key, value in expected.items():
            if code != 0 or get(out, key) != value:
                failures += 1
                print(f'FAIL {name}: {key} expected {value!r}, got {get(out, key) if code == 0 else out!r}')
    # Uncommitted changes outside .review/ refuse to plan.
    write(repo, 'apps/studio/src/App.tsx', 'dirty\n')
    code, out = plan(repo, '--base', base)
    if code != 2:
        failures += 1
        print(f'FAIL uncommitted: expected exit 2, got {code} {out}')
    sh(repo, 'checkout', '-q', '--', '.')
    write(repo, '.review/notes.md', 'scratch\n')
    code, out = plan(repo, '--base', base)
    if code != 0:
        failures += 1
        print(f'FAIL .review scratch should be ignored: {code} {out}')

print('PASS' if failures == 0 else f'{failures} failure(s)', f'{len(CASES) + 2} cases')
sys.exit(1 if failures else 0)
