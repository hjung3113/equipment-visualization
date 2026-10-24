// Pure parts of the consumer check (ADR-0014): reading pnpm-workspace.yaml blocks and picking CSS probe classes.

/** The indented lines under a top-level `section:` of pnpm-workspace.yaml. */
export function readWorkspaceBlock(workspaceYaml, section) {
  const lines = workspaceYaml.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `${section}:`);
  if (start < 0) throw new Error(`pnpm-workspace.yaml has no ${section} block`);
  const block = [];
  for (const line of lines.slice(start + 1)) {
    if (line.length === 0 || !line.startsWith('  ')) break;
    block.push(line);
  }
  return block;
}

/** `  "key": "value"` or `  key: value` lines → [key, value] pairs (quotes removed). */
export function blockEntries(block) {
  const unquote = (text) => {
    const trimmed = text.trim();
    return /^(".*"|'.*')$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
  };
  return block.map((line) => {
    const match = /^\s+("[^"]*"|'[^']*'|[^:\s][^:]*?):\s*(.+)$/.exec(line);
    if (!match) throw new Error(`cannot read pnpm-workspace.yaml entry: ${line.trim()}`);
    return [unquote(match[1]), unquote(match[2])];
  });
}

const UTILITY_PREFIXES = [
  'basis-', 'col-', 'divide-', 'order-', 'outline-', 'ring-', 'row-', 'self-', 'bg-', 'border-', 'bottom-', 'flex-', 'font-', 'gap-', 'grid-', 'h-', 'inset-', 'items-', 'justify-', 'leading-', 'left-', 'm-', 'max-h-',
  'max-w-', 'mb-', 'min-h-', 'min-w-', 'ml-', 'mr-', 'mt-', 'mx-', 'my-', 'opacity-', 'overflow-', 'p-', 'pb-', 'pl-', 'pr-', 'pt-', 'px-',
  'py-', 'right-', 'rounded-', 'shadow-', 'size-', 'space-', 'text-', 'top-', 'tracking-', 'w-', 'z-', 'eqv-',
];
const isCandidate = (token) => /^[a-z][a-z0-9.-]*$/.test(token) && UTILITY_PREFIXES.some((prefix) => token.startsWith(prefix));

function candidates(sourceText) {
  const found = new Set();
  // Line by line, comments skipped: an apostrophe in one comment must not pair with a quote further down the file.
  for (const line of sourceText.split('\n')) {
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
    for (const match of line.matchAll(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|`((?:\\.|[^`\\])*)`/g)) {
      for (const token of (match[1] ?? match[2] ?? match[3] ?? '').split(/\s+/)) if (isCandidate(token)) found.add(token);
    }
  }
  return found;
}

/**
 * For each target package, up to `count` Tailwind-looking class tokens that occur in its built JS and in no other supplied package,
 * and `taken` rejects (the host's own CSS already has it), so neither a sibling nor the host can satisfy the probe. `packages` is [{ name, sourceText }]. For replay the token is an `eqv-rp-*`
 * @utility; elsewhere a plain utility. Throws when a target has none.
 */
export function selectCssProbes(packages, targets, count = 2, taken = () => false) {
  const classes = packages.map(({ name, sourceText }) => ({ name, found: candidates(sourceText) }));
  const owners = new Map();
  for (const { found } of classes) for (const token of found) owners.set(token, (owners.get(token) ?? 0) + 1);
  return classes
    .filter(({ name }) => targets.includes(name))
    .map(({ name, found }) => {
      const own = [...found].filter((token) => owners.get(token) === 1 && !taken(token));
      const preferred = name === 'replay' ? own.filter((token) => token.startsWith('eqv-rp-')) : own.filter((token) => !token.startsWith('eqv-'));
      if (preferred.length === 0) throw new Error(`could not derive a package-only class for @eqv/${name} from its built dist JS`);
      return { name, classNames: preferred.slice(0, count) };
    });
}

/** An exact simple class selector, not one that only shares the prefix. */
export function hasCssSelector(cssText, className) {
  // Tailwind escapes a dot in a class name (size-3.5 → .size-3\.5).
  const escaped = className.replace(/\./g, '\\.').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\.${escaped}(?=[,:\\s{>+~)])`).test(cssText);
}
