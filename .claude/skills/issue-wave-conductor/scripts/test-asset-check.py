#!/usr/bin/env python3
"""asset-check.py on throwaway files: each forbidden pattern fails, a clean asset passes, no assets is fine."""
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / 'asset-check.py'
CLEAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g id="pm-1"><rect id="pm-1-body"/></g>' \
        '<use href="#pm-1"/></svg>'

CASES = [
    # name, file name, content, expected exit, text that must appear
    ('clean svg', 'a.svg', CLEAN, 0, '0 problem(s)'),
    ('clean json', 'a.layout.json', '{"components": [{"id": "pm-1"}]}', 0, '0 problem(s)'),
    ('no viewBox', 'a.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>', 1, 'no viewBox'),
    ('script', 'a.svg', CLEAN.replace('</svg>', '<script>x()</script></svg>'), 1, 'forbidden <script>'),
    ('foreignObject', 'a.svg', CLEAN.replace('</svg>', '<foreignObject/></svg>'), 1, 'forbidden <foreignObject>'),
    ('onclick', 'a.svg', CLEAN.replace('<rect ', '<rect onclick="x()" '), 1, 'event handler onclick='),
    ('external href', 'a.svg', CLEAN.replace('href="#pm-1"', 'href="https://x.test/a.svg"'), 1,
     'external reference'),
    ('javascript url', 'a.svg', CLEAN.replace('href="#pm-1"', 'href="javascript:alert(1)"'), 1, 'javascript: URL'),
    ('duplicate id', 'a.svg', CLEAN.replace('pm-1-body', 'pm-1'), 1, 'duplicate id "pm-1"'),
    ('bad xml', 'a.svg', '<svg viewBox="0 0 1 1">', 1, 'invalid XML'),
    ('duplicate json key', 'a.layout.json', '{"id": "a", "id": "b"}', 1, "duplicate key 'id'"),
    ('bad json', 'a.layout.json', '{"id": ', 1, 'invalid JSON'),
]

failures = 0
for name, filename, content, code, needle in CASES:
    with tempfile.TemporaryDirectory(prefix='asset-check-test-') as tmp:
        assets = Path(tmp) / 'assets' / 'templates'
        assets.mkdir(parents=True)
        (assets / filename).write_text(content)
        r = subprocess.run([sys.executable, str(SCRIPT), tmp], capture_output=True, text=True)
        if r.returncode != code or needle not in r.stdout:
            failures += 1
            print(f'FAIL {name}: exit {r.returncode}, output {r.stdout!r}')
with tempfile.TemporaryDirectory(prefix='asset-check-test-') as tmp:
    r = subprocess.run([sys.executable, str(SCRIPT), tmp], capture_output=True, text=True)
    if r.returncode != 0 or '0 file(s)' not in r.stdout:
        failures += 1
        print(f'FAIL no assets dir: exit {r.returncode}, output {r.stdout!r}')

print('PASS' if failures == 0 else f'{failures} failure(s)', f'asset-check {len(CASES) + 1} cases')
sys.exit(1 if failures else 0)
