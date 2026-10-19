import { canonicalJson, sha256Hex } from '../canonical.js';
import type { LayoutDocument } from '../layout/schema.js';
import { specificity, validateAliasRules } from './validate.js';
import type { AliasRule, AliasRulesFile, MappingEntry, MappingIssue, MappingScope, MappingVersion } from './schema.js';

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function hashVersion(version: Omit<MappingVersion, 'hash'>): Promise<string> {
  return sha256Hex(canonicalJson(version));
}
export async function verifyMappingHash(mapping: MappingVersion): Promise<boolean> {
  const { hash, ...body } = mapping;
  return hash === await hashVersion(body);
}
export function matchAliasRule(rule: AliasRule, alias: string): MappingEntry['target'] | undefined {
  if ('exact' in rule.match) return rule.match.exact.includes(alias) ? rule.target : undefined;
  const names: string[] = [];
  const parts = rule.match.pattern.split(/(\{[a-z]+\})/g).map((part) => {
    if (/^\{[a-z]+\}$/.test(part)) {
      names.push(part.slice(1, -1));
      return '([0-9]+)';
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  const matched = new RegExp(`^(?:${parts.join('')})$`).exec(alias);
  if (!matched || matched[0] !== alias) return undefined;
  if ('ignore' in rule.target) return rule.target;
  const captures = new Map(names.map((name, i) => [name, matched[i + 1]!]));
  let valid = true;
  const componentId = rule.target.componentId.replace(/\{([a-z]+)(:letter)?\}/g, (_, name: string, letter: string | undefined) => {
    const digits = captures.get(name)!;
    if (!letter) return digits;
    const n = Number(digits);
    if (n < 1 || n > 26) { valid = false; return ''; }
    return String.fromCharCode(96 + n);
  });
  return valid ? { ...rule.target, componentId } : undefined;
}
function matchesScope(scope: MappingScope, input: { equipmentId: string; maker: string; model: string }): boolean {
  if (scope.level === 'equipment') return scope.equipmentId === input.equipmentId;
  if (scope.level === 'maker' || scope.level === 'model') {
    return scope.maker === input.maker && (scope.level !== 'model' || scope.model === input.model);
  }
  return true;
}
export type AliasResolution = {
  alias: string;
  /** Winning entry; null when no rule matches or same-level winners overlap. */
  entry: MappingEntry | null;
  /** The tied winning rules when more than one wins at the same level (same-level overlap); otherwise []. */
  overlap: MappingEntry['rule'][];
  /** Issues of the rules that matched this alias at the winning rank (e.g. unknown-target), plus its same-level-overlap. */
  issues: MappingIssue[];
};
export type ResolveAliasRulesInput = {
  equipmentId: string; maker: string; model: string; ruleFiles: AliasRulesFile[]; aliases: string[]; layout: LayoutDocument;
};
function targetIssues(layout: LayoutDocument, target: MappingEntry['target'], path: (string | number)[]): MappingIssue[] {
  if ('ignore' in target) return [];
  const component = layout.components.find((component) => component.id === target.componentId);
  if (!component) return [{ code: 'unknown-target', path: [...path, 'componentId'], message: `Unknown component ${target.componentId}` }];
  const issues: MappingIssue[] = [];
  target.slots?.assign.forEach((range, index) => {
    if (!component.holdingSites.some((site) => site.id === range.holdingSiteId)) issues.push({
      code: 'unknown-target', path: [...path, 'slots', 'assign', index, 'holdingSiteId'], message: `Unknown Holding Site ${target.componentId}/${range.holdingSiteId}`,
    });
  });
  return issues;
}
function dedupe(issues: MappingIssue[]): MappingIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = JSON.stringify([issue.code, issue.path]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
/** Resolves every alias against the rule files without hashing; per-alias outcomes survive other aliases' problems. */
export function resolveAliasRules(input: ResolveAliasRulesInput): { issues: MappingIssue[]; aliases: AliasResolution[] } {
  const preflight: MappingIssue[] = [];
  const files: { file: AliasRulesFile; index: number }[] = [];
  input.ruleFiles.forEach((file, i) => {
    const parsed = validateAliasRules(file);
    if (!parsed.ok) {
      preflight.push(...parsed.issues.map((issue) => ({ ...issue, path: ['ruleFiles', i, ...issue.path] })));
      return;
    }
    files.push({ file: parsed.file, index: i });
    if (!matchesScope(parsed.file.scope, input)) preflight.push({ code: 'scope-mismatch', path: ['ruleFiles', i, 'scope'], message: 'Scope does not belong to the publishing equipment' });
    // Exact targets are invalid even if no observed alias currently uses the rule.
    parsed.file.rules.forEach((rule, j) => {
      if ('exact' in rule.match) preflight.push(...targetIssues(input.layout, rule.target, ['ruleFiles', i, 'rules', j, 'target']));
    });
  });
  const aliasPhase: MappingIssue[] = [];
  const aliases = [...new Set(input.aliases)].sort(compare).map((alias): AliasResolution => {
    const candidates: { entry: MappingEntry; rank: number; exact: boolean; issues: MappingIssue[] }[] = [];
    for (const { file, index } of files) file.rules.forEach((rule, j) => {
      const target = matchAliasRule(rule, alias);
      if (!target) return;
      const exact = 'exact' in rule.match;
      const issues = targetIssues(input.layout, target, ['ruleFiles', index, 'rules', j, 'target']);
      if (!exact && 'componentId' in target) {
        if (!input.layout.components.some((component) => component.id === target.componentId)) return;
        aliasPhase.push(...issues);
      }
      candidates.push({ entry: { alias, target, certainty: rule.certainty, rule: { scope: file.scope, ruleId: rule.id } }, rank: specificity(file.scope), exact, issues });
    });
    const rank = Math.max(...candidates.map((candidate) => candidate.rank));
    const scoped = candidates.filter((candidate) => candidate.rank === rank);
    const winningKind = scoped.some((candidate) => candidate.exact);
    const winners = scoped.filter((candidate) => candidate.exact === winningKind);
    const issues = dedupe(scoped.flatMap((candidate) => candidate.issues));
    if (winners.length > 1) {
      const overlap: MappingIssue = {
        code: 'same-level-overlap', path: ['aliases', input.aliases.indexOf(alias)],
        message: `Alias ${alias} conflicts between rules ${winners.map(({ entry }) => canonicalJson(entry.rule)).sort(compare).join(', ')}`,
      };
      aliasPhase.push(overlap);
      return { alias, entry: null, overlap: winners.map(({ entry }) => entry.rule), issues: [...issues, overlap] };
    }
    return { alias, entry: winners[0]?.entry ?? null, overlap: [], issues };
  });
  return { issues: preflight.length ? preflight : dedupe(aliasPhase), aliases };
}
export async function publishMapping(input: ResolveAliasRulesInput): Promise<{ ok: true; mapping: MappingVersion } | { ok: false; issues: MappingIssue[] }> {
  const resolved = resolveAliasRules(input);
  if (resolved.issues.length) return { ok: false, issues: resolved.issues };
  const entries = resolved.aliases.flatMap(({ entry }) => entry ? [entry] : []);
  const body: Omit<MappingVersion, 'hash'> = { schemaVersion: '0.4', equipmentId: input.equipmentId, layoutId: input.layout.id, entries };
  return { ok: true, mapping: { ...body, hash: await hashVersion(body) } };
}
