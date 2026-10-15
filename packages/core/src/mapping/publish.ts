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
function matchTarget(rule: AliasRule, alias: string): MappingEntry['target'] | undefined {
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
export async function publishMapping(input: {
  equipmentId: string; maker: string; model: string; ruleFiles: AliasRulesFile[]; aliases: string[]; layout: LayoutDocument;
}): Promise<{ ok: true; mapping: MappingVersion } | { ok: false; issues: MappingIssue[] }> {
  const issues: MappingIssue[] = [];
  const files: AliasRulesFile[] = [];
  input.ruleFiles.forEach((file, i) => {
    const parsed = validateAliasRules(file);
    if (!parsed.ok) {
      issues.push(...parsed.issues.map((issue) => ({ ...issue, path: ['ruleFiles', i, ...issue.path] })));
      return;
    }
    files.push(parsed.file);
    if (!matchesScope(parsed.file.scope, input)) issues.push({ code: 'scope-mismatch', path: ['ruleFiles', i, 'scope'], message: 'Scope does not belong to the publishing equipment' });
    // Exact targets are invalid even if no observed alias currently uses the rule.
    parsed.file.rules.forEach((rule, j) => {
      if ('exact' in rule.match) checkTarget(rule.target, ['ruleFiles', i, 'rules', j, 'target']);
    });
  });
  function checkTarget(target: MappingEntry['target'], path: (string | number)[]): boolean {
    if ('ignore' in target) return true;
    const component = input.layout.components.find((component) => component.id === target.componentId);
    if (!component) {
      issues.push({ code: 'unknown-target', path: [...path, 'componentId'], message: `Unknown component ${target.componentId}` });
      return false;
    }
    target.slots?.assign.forEach((range, index) => {
      if (!component.holdingSites.some((site) => site.id === range.holdingSiteId)) issues.push({
        code: 'unknown-target', path: [...path, 'slots', 'assign', index, 'holdingSiteId'], message: `Unknown Holding Site ${target.componentId}/${range.holdingSiteId}`,
      });
    });
    return true;
  }
  if (issues.length) return { ok: false, issues };
  const entries: MappingEntry[] = [];
  for (const alias of [...new Set(input.aliases)].sort(compare)) {
    const candidates: { entry: MappingEntry; rank: number; exact: boolean }[] = [];
    files.forEach((file, i) => file.rules.forEach((rule, j) => {
      const target = matchTarget(rule, alias);
      if (!target) return;
      const exact = 'exact' in rule.match;
      if (!exact && 'componentId' in target) {
        if (!input.layout.components.some((component) => component.id === target.componentId)) return;
        checkTarget(target, ['ruleFiles', i, 'rules', j, 'target']);
      }
      candidates.push({ entry: { alias, target, certainty: rule.certainty, rule: { scope: file.scope, ruleId: rule.id } }, rank: specificity(file.scope), exact });
    }));
    const rank = Math.max(...candidates.map((candidate) => candidate.rank));
    const scoped = candidates.filter((candidate) => candidate.rank === rank);
    const winningKind = scoped.some((candidate) => candidate.exact);
    const winners = scoped.filter((candidate) => candidate.exact === winningKind);
    if (winners.length > 1) issues.push({
      code: 'same-level-overlap', path: ['aliases', input.aliases.indexOf(alias)],
      message: `Alias ${alias} conflicts between rules ${winners.map(({ entry }) => canonicalJson(entry.rule)).sort(compare).join(', ')}`,
    });
    else if (winners[0]) entries.push(winners[0].entry);
  }
  if (issues.length) {
    const seen = new Set<string>();
    return { ok: false, issues: issues.filter((issue) => {
      const key = JSON.stringify([issue.code, issue.path]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }) };
  }
  const body: Omit<MappingVersion, 'hash'> = { schemaVersion: '0.4', equipmentId: input.equipmentId, layoutId: input.layout.id, entries };
  return { ok: true, mapping: { ...body, hash: await hashVersion(body) } };
}
