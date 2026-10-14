#!/usr/bin/env python3
"""asset-check.py <checkout> [paths...] — structural asset gates from AGENTS.md "Change quality gates".

Checks every `*.svg` and `*.json` under `assets/` (or only the given paths), schema-agnostic, so it holds before the
layout schema is pinned:

- JSON parses, and no object repeats a key (a silently dropped duplicate is a lost component or port);
- SVG is well-formed XML with a `viewBox` on the root, unique `id` attributes, and no executable or external
  content: `<script>`, `<foreignObject>`, `on*=` handlers, `javascript:` URLs, or `href` to anything but `#…`.

Schema-level checks (source/target ports exist, valid levels, no hierarchy cycles) belong to `packages/core`'s
validator once it exists; `verify.sh` runs that through the repo's own `test` script.

Prints one line per problem and a summary; exits 1 on any problem, 0 otherwise (including no assets yet).
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

EVENT_ATTR = re.compile(r'^on[a-z]+$', re.I)
FORBIDDEN_TAGS = {'script', 'foreignObject'}


def local(name):
    return name.rsplit('}', 1)[-1]


def check_json(path):
    def no_dupes(pairs):
        seen = set()
        for key, _ in pairs:
            if key in seen:
                raise ValueError(f'duplicate key {key!r}')
            seen.add(key)
        return dict(pairs)
    try:
        json.loads(path.read_text(), object_pairs_hook=no_dupes)
    except ValueError as e:
        return [f'{path}: invalid JSON: {e}']
    return []


def check_svg(path):
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as e:
        return [f'{path}: invalid XML: {e}']
    problems = []
    if local(root.tag) != 'svg':
        problems.append(f'{path}: root element is <{local(root.tag)}>, not <svg>')
    if 'viewBox' not in root.attrib:
        problems.append(f'{path}: root <svg> has no viewBox')
    ids = {}
    for el in root.iter():
        tag = local(el.tag)
        if tag in FORBIDDEN_TAGS:
            problems.append(f'{path}: forbidden <{tag}>')
        for name, value in el.attrib.items():
            attr = local(name)
            if EVENT_ATTR.match(attr):
                problems.append(f'{path}: event handler {attr}= on <{tag}>')
            if 'javascript:' in value.replace(' ', '').lower():
                problems.append(f'{path}: javascript: URL in {attr}= on <{tag}>')
            if attr == 'href' and value and not value.startswith('#'):
                problems.append(f'{path}: external reference {attr}="{value[:60]}" on <{tag}>')
            if attr == 'id':
                if value in ids:
                    problems.append(f'{path}: duplicate id "{value}"')
                ids[value] = True
    return problems


def main():
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    root = Path(sys.argv[1])
    targets = [root / p for p in sys.argv[2:]] or sorted(
        p for p in (root / 'assets').rglob('*') if p.suffix in ('.svg', '.json') and p.is_file())
    problems = []
    for path in targets:
        problems += check_svg(path) if path.suffix == '.svg' else check_json(path)
    for problem in problems:
        print(problem)
    print(f'asset-check: {len(targets)} file(s), {len(problems)} problem(s)')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
