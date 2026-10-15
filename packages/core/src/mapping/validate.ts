import type { z } from 'zod';
import {
  aliasRulesFileSchema, bindingsFileSchema, typeDictionaryFileSchema,
  type MappingIssue, type MappingScope, type TypeDictionaryFile,
} from './schema.js';

type Result<T> = { ok: true; file: T } | { ok: false; issues: MappingIssue[] };
function validate<T>(schema: z.ZodType<T>, input: unknown, semantic: (file: T) => MappingIssue[]): Result<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((issue) => ({
    code: 'schema', path: issue.path.map((part) => typeof part === 'symbol' ? String(part) : part), message: issue.message,
  })) };
  const issues = semantic(parsed.data);
  return issues.length ? { ok: false, issues } : { ok: true, file: parsed.data };
}
export const specificity = (scope: MappingScope): number => ({ global: 0, maker: 1, model: 2, equipment: 3 })[scope.level];
/** Resolves the most specific supplied scope with an entry; conflicting roles at that rank stay unknown. */
export function resolveRole(dictionaries: TypeDictionaryFile[], moduleType: string): string {
  let role = 'unknown';
  let rank = -1;
  for (const file of dictionaries) {
    const entry = file.entries.find((entry) => entry.moduleType === moduleType);
    if (entry && specificity(file.scope) > rank) {
      role = entry.role;
      rank = specificity(file.scope);
    } else if (entry && specificity(file.scope) === rank && entry.role !== role) {
      role = 'unknown';
    }
  }
  return role;
}
export function validateTypeDictionary(input: unknown) {
  return validate(typeDictionaryFileSchema, input, (file) => {
    const seen = new Set<string>();
    const issues: MappingIssue[] = [];
    file.entries.forEach((entry, i) => {
      if (seen.has(entry.moduleType)) issues.push({ code: 'duplicate-entry', path: ['entries', i, 'moduleType'], message: `Duplicate moduleType ${entry.moduleType}` });
      seen.add(entry.moduleType);
    });
    return issues;
  });
}
export function validateAliasRules(input: unknown) {
  return validate(aliasRulesFileSchema, input, (file) => {
    const issues: MappingIssue[] = [];
    const ids = new Set<string>();
    const aliases = new Set<string>();
    file.rules.forEach((rule, i) => {
      if (ids.has(rule.id)) issues.push({ code: 'duplicate-id', path: ['rules', i, 'id'], message: `Duplicate rule ${rule.id}` });
      ids.add(rule.id);
      if ('exact' in rule.match) rule.match.exact.forEach((alias, j) => {
        if (aliases.has(alias)) issues.push({ code: 'duplicate-alias', path: ['rules', i, 'match', 'exact', j], message: `Duplicate alias ${alias}` });
        aliases.add(alias);
      });
      if ('ignore' in rule.target) return;
      const captures = new Set('pattern' in rule.match ? Array.from(rule.match.pattern.matchAll(/\{([a-z]+)\}/g), (m) => m[1]) : []);
      for (const match of rule.target.componentId.matchAll(/\{([a-z]+)(?::letter)?\}/g)) {
        if (!captures.has(match[1])) issues.push({ code: 'unknown-capture', path: ['rules', i, 'target', 'componentId'], message: `Unknown capture ${match[1]}` });
      }
      const ranges = rule.target.slots?.assign ?? [];
      ranges.forEach((range, j) => {
        if (ranges.slice(0, j).some((previous) => range.from <= previous.to && previous.from <= range.to)) {
          issues.push({ code: 'overlapping-slots', path: ['rules', i, 'target', 'slots', 'assign', j], message: 'Inclusive slot ranges overlap' });
        }
      });
    });
    return issues;
  });
}
export function validateBindings(input: unknown) {
  return validate(bindingsFileSchema, input, (file) => {
    const issues: MappingIssue[] = [];
    const ordered = file.bindings.map((binding, index) => ({ binding, index }))
      .sort((a, b) => a.binding.effectiveFrom < b.binding.effectiveFrom ? -1 : a.binding.effectiveFrom > b.binding.effectiveFrom ? 1 : 0);
    ordered.forEach(({ binding, index }, i) => {
      if (binding.effectiveTo !== undefined && binding.effectiveFrom >= binding.effectiveTo) {
        issues.push({ code: 'binding-order', path: ['bindings', index, 'effectiveTo'], message: 'effectiveFrom must precede effectiveTo' });
      }
      if (binding.effectiveTo === undefined && i !== ordered.length - 1) {
        issues.push({ code: 'binding-order', path: ['bindings', index], message: 'Only the latest binding may be open-ended' });
      }
      if (ordered.slice(0, i).some(({ binding: previous }) => previous.effectiveTo === undefined || previous.effectiveTo > binding.effectiveFrom)) {
        issues.push({ code: 'binding-overlap', path: ['bindings', index], message: 'Binding intervals overlap' });
      }
    });
    return issues;
  });
}
