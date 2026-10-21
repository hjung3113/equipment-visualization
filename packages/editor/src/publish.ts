import {
  compareNatural, computeCoverage, findMappingConflicts, latestBinding as coreLatestBinding, layoutRevision, publishMapping, siteWallClockSchema, validateBindings,
  type BindingsFile, type Coverage, type EquipmentLayoutDocument, type MappingConflict, type MappingEntry, type MappingIssue,
  type MappingVersion, type ObservedInventory, type TypeDictionaryFile,
} from '@eqv/core';
import type { TopViewerProps } from '@eqv/renderer';
import type { RuleFiles } from './board.js';

type Highlight = NonNullable<TopViewerProps['highlight']>;

export interface DryRunInput {
  equipment: { equipmentId: string; maker: string; model: string };
  inventory: ObservedInventory;
  dictionaries: readonly TypeDictionaryFile[];
  /** The draft layout the Mapping Version is published against. */
  layout: EquipmentLayoutDocument;
  /** The saved rule files; unsaved Board edits are not part of a dry-run. */
  ruleFiles: RuleFiles;
}

export interface DryRun {
  mapping: MappingVersion | null;
  issues: MappingIssue[];
  /** Computed only when the mapping exists. */
  coverage: Coverage | null;
  conflicts: MappingConflict[];
}

export interface DiffEntry { alias: string; change: 'added' | 'removed' | 'changed'; before: string | null; after: string | null }

export interface PublishPlan {
  /** Korean; non-empty means Publish is disabled. */
  problems: string[];
  /** `sha256:<hex>` of the draft layout. */
  layoutRevision: string;
  mapping: MappingVersion | null;
  /** The sample Inventory this Mapping Version is published against. */
  baseline: ObservedInventory;
  /** The file to write; null when there are problems. */
  bindings: BindingsFile | null;
  diff: { entries: DiffEntry[]; unchanged: number; layout: string; binding: string[]; conflicts: number };
}

export type PlanInput = DryRunInput & {
  bindings: BindingsFile | null;
  /** The Mapping Version of the latest binding, when it could be loaded. */
  previous: MappingVersion | null;
  effectiveFrom: string;
};

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
/** First 12 hex characters of a `sha256:<hex>` value. */
export const shortHash = (hash: string) => hash.replace(/^sha256:/, '').slice(0, 12);

export async function dryRun(input: DryRunInput): Promise<DryRun> {
  const { equipment, inventory, layout, ruleFiles } = input;
  const published = await publishMapping({
    ...equipment, layout, aliases: inventory.aliases.map(({ alias }) => alias),
    ruleFiles: [ruleFiles.maker, ruleFiles.model, ruleFiles.equipment].flatMap((file) => file ? [file] : []),
  });
  if (!published.ok) return { mapping: null, issues: published.issues, coverage: null, conflicts: [] };
  const { mapping } = published;
  return {
    mapping, issues: [], coverage: computeCoverage(inventory, mapping),
    conflicts: findMappingConflicts({ inventory, mapping, layout, dictionaries: [...input.dictionaries] }),
  };
}

export function latestBinding(bindings: BindingsFile | null) {
  return (bindings ? coreLatestBinding(bindings.bindings) : undefined) ?? null;
}

/** D7: use the Inventory boundary only when it is later than the latest binding. */
export function defaultEffectiveFrom(inventory: ObservedInventory, bindings: BindingsFile | null): string {
  const latest = latestBinding(bindings);
  return latest ? inventory.to > latest.effectiveFrom ? inventory.to : '' : inventory.from;
}

function targetText(target: MappingEntry['target']): string {
  if ('ignore' in target) return '무시';
  const { slots } = target;
  if (!slots) return target.componentId;
  const ranges = slots.assign.map(({ from, to, holdingSiteId }) => `${from}-${to}=${holdingSiteId}`).join(',');
  return `${target.componentId}/${slots.offset ? `offset${slots.offset}:` : ''}${ranges}`;
}
const entryText = (entry: MappingEntry) =>
  `${targetText(entry.target)} · ${entry.certainty} · ${entry.rule.scope.level}:${entry.rule.ruleId}`;

function diffEntries(previous: MappingVersion | null, next: MappingVersion | null): { entries: DiffEntry[]; unchanged: number } {
  const before = new Map((previous?.entries ?? []).map((entry) => [entry.alias, entryText(entry)]));
  const after = new Map((next?.entries ?? []).map((entry) => [entry.alias, entryText(entry)]));
  const entries: DiffEntry[] = [];
  let unchanged = 0;
  for (const alias of [...new Set([...before.keys(), ...after.keys()])].sort(compareNatural)) {
    const a = before.get(alias) ?? null;
    const b = after.get(alias) ?? null;
    if (a === b) unchanged++;
    else entries.push({ alias, change: a === null ? 'added' : b === null ? 'removed' : 'changed', before: a, after: b });
  }
  return { entries, unchanged };
}

const bindingIssueText = (issue: MappingIssue) => issue.code === 'binding-overlap' ? 'Binding 구간이 겹칩니다'
  : issue.code === 'binding-order' ? `Binding 순서가 올바르지 않습니다: ${issue.message}` : `bindings 파일이 올바르지 않습니다 (${issue.code}): ${issue.message}`;

export async function planPublish(input: PlanInput): Promise<PublishPlan> {
  const [run, revision] = await Promise.all([dryRun(input), layoutRevision(input.layout)]);
  return derivePublishPlan(input, { run, revision });
}

/** Date edits only derive a plan from the already computed dry-run and revision. */
export function derivePublishPlan(input: PlanInput, { run, revision }: { run: DryRun; revision: string }): PublishPlan {
  const { equipment, bindings, previous, effectiveFrom } = input;
  const problems = run.issues.map((issue) => `규칙 문제 (${issue.code}): ${issue.message}`);
  const latest = latestBinding(bindings);
  let validFrom = siteWallClockSchema.safeParse(effectiveFrom).success;
  if (!validFrom) problems.push('effectiveFrom 형식이 올바르지 않습니다 (YYYY-MM-DDTHH:mm:ss.sss)');
  else if (latest && effectiveFrom <= latest.effectiveFrom) {
    problems.push(`effectiveFrom은 마지막 binding의 effectiveFrom(${latest.effectiveFrom})보다 늦어야 합니다`);
    validFrom = false;
  }
  const { mapping } = run;
  if (mapping && latest && latest.mappingHash === mapping.hash && latest.layoutRevision === revision) problems.push('이전 게시와 같습니다');

  let file: BindingsFile | null = null;
  const lines: string[] = [];
  if (mapping && validFrom) {
    const closing = latest && latest.effectiveTo === undefined;
    file = {
      schemaVersion: '0.4', equipmentId: equipment.equipmentId,
      bindings: [
        ...(bindings?.bindings ?? []).map((binding) => binding === latest && closing ? { ...binding, effectiveTo: effectiveFrom } : binding),
        { layoutId: input.layout.id, mappingHash: mapping.hash, layoutRevision: revision, effectiveFrom },
      ],
    };
    if (closing) lines.push(`열린 binding(${latest.effectiveFrom} ~)을 ${effectiveFrom}에서 닫습니다`);
    lines.push(`새 binding ${effectiveFrom} ~ (열림) · mapping ${shortHash(mapping.hash)}`);
    const checked = validateBindings(file);
    if (!checked.ok) {
      problems.push(...checked.issues.map(bindingIssueText));
      file = null;
    }
  }
  const compared = latest?.layoutRevision;
  const layoutLine = `${input.layout.id} · revision ${shortHash(revision)} (${compared === undefined ? '이전 기록 없음'
    : compared === revision ? '이전과 같음' : `이전 ${shortHash(compared)}`})`;
  return {
    problems, layoutRevision: revision, mapping, baseline: input.inventory, bindings: problems.length ? null : file,
    diff: { ...diffEntries(previous, mapping), layout: layoutLine, binding: lines, conflicts: run.conflicts.length },
  };
}

/** D11. The line joins two observed transfer ends for display; it is not a path, a port link or a capability. */
export function conflictHighlight(conflict: MappingConflict): Highlight {
  if (conflict.kind !== 'transfer-without-capability') return { componentIds: [conflict.componentId] };
  return {
    componentIds: [conflict.fromComponentId, conflict.toComponentId],
    transfers: [{
      from: conflict.fromComponentId, to: conflict.toComponentId,
      label: `관측 이송 ${conflict.from} → ${conflict.to} ${conflict.count}건 (Transfer Capability 없음)`,
    }],
  };
}

export interface ModelDryRunInput {
  equipmentId: string;
  published: boolean | null;
  /** A load failure; the row shows it and nothing is computed. */
  error?: string;
  /** `layout: null` means the equipment has no draft layout. */
  input?: Omit<DryRunInput, 'layout'> & { layout: EquipmentLayoutDocument | null };
}

export interface ModelDryRunRow {
  equipmentId: string;
  status: '게시됨' | '미게시' | '—';
  referenceRatio: number | null;
  aliasRatio: number | null;
  conflicts: number | null;
  unmappedReferences: number | null;
  blockingIssues: number | null;
  error: string | null;
}

/** D12 order: blocking issues (an error row counts as one), more conflicts, lower reference coverage, then `equipmentId`. */
export async function modelDryRunRows(rows: ModelDryRunInput[]): Promise<ModelDryRunRow[]> {
  const computed = await Promise.all(rows.map(async (row): Promise<ModelDryRunRow> => {
    const status = row.published === null ? '—' : row.published ? '게시됨' : '미게시';
    const failed = (error: string): ModelDryRunRow => ({
      equipmentId: row.equipmentId, status, referenceRatio: null, aliasRatio: null, conflicts: null,
      unmappedReferences: null, blockingIssues: null, error,
    });
    if (row.error !== undefined) return failed(row.error);
    if (!row.input?.layout) return failed('레이아웃 초안 없음');
    try {
      const run = await dryRun({ ...row.input, layout: row.input.layout });
      return {
        equipmentId: row.equipmentId, status, referenceRatio: run.coverage?.references.ratio ?? null,
        aliasRatio: run.coverage?.aliases.ratio ?? null, conflicts: run.mapping ? run.conflicts.length : null,
        unmappedReferences: run.coverage ? run.coverage.unmapped.reduce((sum, { references }) => sum + references, 0) : null,
        blockingIssues: run.issues.length, error: null,
      };
    } catch (error) {
      return failed(error instanceof Error ? error.message : String(error));
    }
  }));
  const blocking = (row: ModelDryRunRow) => row.error !== null ? 1 : row.blockingIssues ?? 0;
  return computed.sort((a, b) => blocking(b) - blocking(a) || (b.conflicts ?? 0) - (a.conflicts ?? 0) ||
    (a.referenceRatio ?? 1) - (b.referenceRatio ?? 1) || compare(a.equipmentId, b.equipmentId));
}
