import type { ObservedInventory } from '../inventory/schema.js';
import type { TemplateDocument } from '../layout/schema.js';
import type { TypeDictionaryFile } from '../mapping/schema.js';
import { resolveRole } from '../mapping/validate.js';
import { componentsLinked } from './conflicts.js';
import { compareNatural, compareText } from './order.js';

type AssignmentBasis = 'unique-role' | 'transfer-neighbors' | 'natural-order';
export type TemplateProposal = {
  templateId: string; rank: number; fits: boolean;
  roleFit: { role: string; observed: number; drawn: number; min: number; max: number; inRange: boolean }[];
  rolesOutOfRange: number;
  transfers: { explained: number; total: number; ratio: number | null };
  unexplainedAliases: string[];
  exactRoleMatches: number;
  assignments: { alias: string; componentId: string; certainty: 'assumed'; basis: AssignmentBasis }[];
  evidence: string;
};

export function proposeTemplates({ inventory, dictionaries, templates }: {
  inventory: ObservedInventory; dictionaries: TypeDictionaryFile[]; templates: TemplateDocument[];
}): TemplateProposal[] {
  const aliasesByRole = new Map<string, string[]>();
  for (const row of inventory.aliases) {
    const role = row.moduleType === undefined ? 'unknown' : resolveRole(dictionaries, row.moduleType);
    if (role === 'unknown') continue;
    const aliases = aliasesByRole.get(role) ?? [];
    aliases.push(row.alias);
    aliasesByRole.set(role, aliases);
  }
  const roles = [...aliasesByRole.keys()].sort(compareText);
  for (const aliases of aliasesByRole.values()) aliases.sort(compareNatural);
  const total = inventory.transfers.reduce((sum, pair) => sum + pair.count, 0);
  const proposals = templates.map((template): TemplateProposal => {
    const componentsFor = (role: string) => template.components.filter((component) => component.role === role)
      .sort((a, b) => compareText(a.id, b.id));
    const roleFit = roles.map((role) => {
      const observed = aliasesByRole.get(role)!.length;
      const drawn = componentsFor(role).length;
      const { min, max } = template.roleCardinality[role] ?? { min: 0, max: 0 };
      return { role, observed, drawn, min, max, inRange: observed >= min && observed <= max };
    });
    const assignments = new Map<string, TemplateProposal['assignments'][number]>();
    const used = new Set<string>();
    const assign = (alias: string, componentId: string, basis: AssignmentBasis) => {
      assignments.set(alias, { alias, componentId, certainty: 'assumed', basis });
      used.add(componentId);
    };
    for (const role of roles) {
      const aliases = aliasesByRole.get(role)!;
      const components = componentsFor(role);
      if (aliases.length === 1 && components.length === 1) assign(aliases[0]!, components[0]!.id, 'unique-role');
    }
    for (const role of roles) {
      for (const alias of aliasesByRole.get(role)!) {
        if (assignments.has(alias)) continue;
        const neighbours = inventory.transfers.flatMap((pair) => {
          const neighbour = pair.from === alias ? pair.to : pair.to === alias ? pair.from : undefined;
          const assignment = neighbour === undefined ? undefined : assignments.get(neighbour);
          return assignment ? [assignment.componentId] : [];
        });
        if (!neighbours.length) continue;
        const candidates = componentsFor(role).filter(({ id }) => !used.has(id) &&
          neighbours.every((neighbour) => componentsLinked(template, id, neighbour)));
        if (candidates.length === 1) assign(alias, candidates[0]!.id, 'transfer-neighbors');
      }
    }
    for (const role of roles) {
      const remaining = componentsFor(role).filter(({ id }) => !used.has(id));
      for (const alias of aliasesByRole.get(role)!) {
        if (assignments.has(alias)) continue;
        const component = remaining.shift();
        if (component) assign(alias, component.id, 'natural-order');
      }
    }
    const unexplainedAliases = inventory.aliases.map(({ alias }) => alias).filter((alias) => !assignments.has(alias)).sort(compareNatural);
    const explained = inventory.transfers.reduce((sum, pair) => {
      const a = assignments.get(pair.from);
      const b = assignments.get(pair.to);
      return sum + (a && b && componentsLinked(template, a.componentId, b.componentId) ? pair.count : 0);
    }, 0);
    const rolesOutOfRange = roleFit.filter(({ inRange }) => !inRange).length;
    const evidence = roleFit.map(({ role, observed, drawn, min, max, inRange }) =>
      inRange && observed === drawn ? `${role.toUpperCase()} ${observed}/${drawn} ✓` :
        `${role.toUpperCase()} ${observed} (${min}–${max}) ${inRange ? '✓' : '✗'}`);
    evidence.push(total === 0 ? '이송 없음' : `이송 ${explained}/${total} ${explained === total ? '✓' : '✗'}`,
      `설명 안 되는 alias ${unexplainedAliases.length}`);
    return { templateId: template.id, rank: 0, fits: rolesOutOfRange === 0, roleFit, rolesOutOfRange,
      transfers: { explained, total, ratio: total === 0 ? null : explained / total }, unexplainedAliases,
      exactRoleMatches: roleFit.filter(({ observed, drawn, inRange }) => inRange && observed === drawn).length,
      assignments: [...assignments.values()].sort((a, b) => compareNatural(a.alias, b.alias)), evidence: evidence.join(', ') };
  });
  return proposals.sort((a, b) => a.rolesOutOfRange - b.rolesOutOfRange ||
    (b.transfers.ratio ?? -1) - (a.transfers.ratio ?? -1) ||
    a.unexplainedAliases.length - b.unexplainedAliases.length || b.exactRoleMatches - a.exactRoleMatches ||
    compareText(a.templateId, b.templateId)).slice(0, 3).map((proposal, i) => ({ ...proposal, rank: i + 1 }));
}
