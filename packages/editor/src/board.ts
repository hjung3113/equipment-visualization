import {
  buildGenericLayout, compareNatural, findMappingConflicts, proposeTemplates, resolveAliasRules, resolveRole,
  type AliasResolution, type AliasRule, type AliasRulesFile, type EquipmentLayoutDocument, type MappingConflict,
  type MappingEntry, type MappingIssue, type ObservedInventory, type TemplateDocument, type TypeDictionaryFile,
} from '@eqv/core';

/** Scope level whose alias-rules file the Board edits; the maker file is read-only context. */
export type SaveScope = 'model' | 'equipment';
export type RuleFiles = { maker?: AliasRulesFile; model?: AliasRulesFile; equipment?: AliasRulesFile };
export type Pending = Record<SaveScope, AliasRulesFile>;
export type BoardStatus = 'conflict' | 'ignored' | 'verified' | 'assumed' | 'unmapped';

export interface BoardInput {
  equipment: { equipmentId: string; maker: string; model: string };
  inventory: ObservedInventory;
  dictionaries: readonly TypeDictionaryFile[];
  /** The draft Equipment Layout the aliases are assigned onto. */
  layout: EquipmentLayoutDocument;
  ruleFiles: RuleFiles;
  templates: readonly TemplateDocument[];
}

export interface BoardRow {
  alias: string;
  moduleType: string | null;
  role: string;
  slots: string[];
  status: BoardStatus;
  /** Status symbol and text; never colour alone. */
  statusText: string;
  /** An automatic assignment that is not saved yet. */
  draft: boolean;
  componentId: string | null;
  target: MappingEntry['target'] | null;
  rule: { level: string; ruleId: string; kind: 'exact' | 'pattern' } | null;
  certainty: 'verified' | 'assumed' | null;
  conflicts: MappingConflict[];
  issues: MappingIssue[];
  overlap: MappingEntry['rule'][];
  /** Set when the save scope is Model and an Equipment-scope rule wins: that rule's id. */
  overriddenBy: string | null;
}

export interface BoardView {
  rows: BoardRow[];
  groups: { role: string; rows: BoardRow[] }[];
  /** Resolution issues that no alias reports itself. */
  unattributed: MappingIssue[];
  missingTemplate: string | null;
  /** Aliases currently shown from automatic assignments. */
  drafts: string[];
  /** The file of the save scope with the drafts written as assumed exact rules; equals pending when there are none. */
  saveScopeFile: AliasRulesFile;
}

export interface BoardState {
  present: Pending;
  /** Last acknowledged contents per scope. */
  baseline: Pending;
  past: Pending[];
  future: Pending[];
}

export interface SavePayload {
  files: { scope: SaveScope; file: AliasRulesFile }[];
  /** The pending files this payload was built from. */
  source: Pending;
}
export interface SaveOutcome { savedScopes: readonly SaveScope[]; error?: string }

export type BoardEdit = { kind: 'assign'; alias: string; componentId: string } | { kind: 'confirm' | 'ignore'; alias: string };

const STATUS_TEXT: Record<BoardStatus, string> = {
  conflict: '⚠ 충돌', ignored: '⊘ 무시', verified: '● 확정', assumed: '◐ 자동', unmapped: '○ 미매핑',
};
const DRAFT_TEXT = '◐ 자동 (미저장)';

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => compare(a, b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const scopeOf = (equipment: BoardInput['equipment'], scope: SaveScope): AliasRulesFile['scope'] => scope === 'model'
  ? { level: 'model', maker: equipment.maker, model: equipment.model } : { level: 'equipment', equipmentId: equipment.equipmentId };
const emptyFile = (equipment: BoardInput['equipment'], scope: SaveScope): AliasRulesFile =>
  ({ schemaVersion: '0.4', scope: scopeOf(equipment, scope), rules: [] });

/** Starts from the files as loaded; a missing file is an empty rule list, which compares equal to no file. */
export function createBoardState(input: Pick<BoardInput, 'equipment' | 'ruleFiles'>): BoardState {
  const files: Pending = {
    model: input.ruleFiles.model ?? emptyFile(input.equipment, 'model'),
    equipment: input.ruleFiles.equipment ?? emptyFile(input.equipment, 'equipment'),
  };
  return { present: files, baseline: files, past: [], future: [] };
}

export const SCOPES: readonly SaveScope[] = ['model', 'equipment'];
const same = (a: AliasRulesFile, b: AliasRulesFile) => canonical(a) === canonical(b);
export const dirtyScopes = (state: BoardState): SaveScope[] => SCOPES.filter((scope) => !same(state.present[scope], state.baseline[scope]));
export const isDirty = (state: BoardState): boolean => dirtyScopes(state).length > 0;
export const canUndo = (state: BoardState): boolean => state.past.length > 0;
export const canRedo = (state: BoardState): boolean => state.future.length > 0;

export function undo(state: BoardState): BoardState {
  const previous = state.past.at(-1);
  return previous ? { ...state, present: previous, past: state.past.slice(0, -1), future: [state.present, ...state.future] } : state;
}
export function redo(state: BoardState): BoardState {
  const next = state.future[0];
  return next ? { ...state, present: next, past: [...state.past, state.present], future: state.future.slice(1) } : state;
}

export function ruleSlug(alias: string): string {
  const slug = alias.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `board-${slug || 'alias'}`;
}
function freshId(alias: string, taken: ReadonlySet<string>): string {
  const base = ruleSlug(alias);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Aliases the automatic assignment would place, keyed by alias; only components that exist with the same Role. */
function autoAssignments(input: BoardInput): { drafts: Map<string, string>; missingTemplate: string | null } {
  const { inventory, layout } = input;
  const dictionaries = [...input.dictionaries];
  const drafts = new Map<string, string>();
  if (inventory.aliases.length === 0) return { drafts, missingTemplate: null };
  let assignments: { alias: string; componentId: string }[];
  let source: { components: readonly { id: string; role: string }[] };
  if (layout.templateId === 'generic') {
    const generic = buildGenericLayout({ inventory, dictionaries });
    assignments = generic.assignments;
    source = generic.layout;
  } else {
    const template = input.templates.find(({ id }) => id === layout.templateId);
    if (!template) return { drafts, missingTemplate: layout.templateId };
    assignments = proposeTemplates({ inventory, dictionaries, templates: [template] })[0]?.assignments ?? [];
    source = template;
  }
  for (const { alias, componentId } of assignments) {
    const wanted = source.components.find(({ id }) => id === componentId);
    const actual = layout.components.find(({ id }) => id === componentId);
    if (wanted && actual && wanted.role === actual.role) drafts.set(alias, componentId);
  }
  return { drafts, missingTemplate: null };
}

function withRules(file: AliasRulesFile, rules: AliasRule[]): AliasRulesFile {
  return rules.length ? { ...file, rules: [...file.rules, ...rules] } : file;
}
function allFiles(input: BoardInput, files: Pending, saveFile: AliasRulesFile, saveScope: SaveScope): AliasRulesFile[] {
  const byScope = { ...files, [saveScope]: saveFile };
  return [input.ruleFiles.maker, byScope.model, byScope.equipment].flatMap((file) => file ? [file] : []);
}

function conflictNames(conflict: MappingConflict, alias: string): boolean {
  return conflict.kind === 'transfer-without-capability' ? conflict.from === alias || conflict.to === alias : conflict.alias === alias;
}
const issueKey = (issue: MappingIssue) => JSON.stringify([issue.code, issue.path]);

/** Resolves every Inventory alias against the pending files plus the automatic drafts, and checks the result. */
export function resolveBoard(input: BoardInput, files: Pending, saveScope: SaveScope): BoardView {
  const { equipment, inventory, layout } = input;
  const aliases = inventory.aliases.map(({ alias }) => alias);
  const resolveWith = (saveFile: AliasRulesFile) => resolveAliasRules({
    equipmentId: equipment.equipmentId, maker: equipment.maker, model: equipment.model,
    ruleFiles: allFiles(input, files, saveFile, saveScope), aliases, layout,
  });
  const base = resolveWith(files[saveScope]);
  const { drafts, missingTemplate } = autoAssignments(input);
  const draftedBy = new Map(base.aliases.flatMap((row) => drafts.has(row.alias) && row.entry === null && row.overlap.length === 0
    ? [[row.alias, drafts.get(row.alias)!] as const] : []));
  const taken = new Set(files[saveScope].rules.map(({ id }) => id));
  const draftRules: AliasRule[] = [...draftedBy].sort(([a], [b]) => compareNatural(a, b)).map(([alias, componentId]) => {
    const id = freshId(alias, taken);
    taken.add(id);
    return { id, match: { exact: [alias] }, target: { componentId }, certainty: 'assumed' };
  });
  const saveScopeFile = withRules(files[saveScope], draftRules);
  const resolved = draftRules.length ? resolveWith(saveScopeFile) : base;
  const entries = resolved.aliases.flatMap(({ entry }) => entry ? [entry] : []);
  const conflicts = findMappingConflicts({
    inventory, layout, dictionaries: [...input.dictionaries],
    mapping: { schemaVersion: '0.4', equipmentId: equipment.equipmentId, layoutId: layout.id, entries },
  });
  const byAlias = new Map(resolved.aliases.map((row): [string, AliasResolution] => [row.alias, row]));
  const ruleKind = (entry: MappingEntry): 'exact' | 'pattern' => {
    const file = [input.ruleFiles.maker, saveScopeFile, files[saveScope === 'model' ? 'equipment' : 'model']]
      .find((candidate) => candidate && canonical(candidate.scope) === canonical(entry.rule.scope));
    const rule = file?.rules.find(({ id }) => id === entry.rule.ruleId);
    return rule && 'pattern' in rule.match ? 'pattern' : 'exact';
  };
  const rows = inventory.aliases.map((item): BoardRow => {
    const resolution = byAlias.get(item.alias)!;
    const { entry, overlap, issues } = resolution;
    const draft = draftedBy.has(item.alias);
    const rowConflicts = conflicts.filter((conflict) => conflictNames(conflict, item.alias));
    const status: BoardStatus = overlap.length > 1 || issues.length || rowConflicts.length ? 'conflict'
      : !entry ? 'unmapped' : 'ignore' in entry.target ? 'ignored' : entry.certainty === 'verified' ? 'verified' : 'assumed';
    const target = entry?.target ?? null;
    return {
      alias: item.alias, moduleType: item.moduleType ?? null, slots: item.slots, status, draft,
      role: item.moduleType === undefined ? 'unknown' : resolveRole([...input.dictionaries], item.moduleType),
      statusText: draft && status === 'assumed' ? DRAFT_TEXT : STATUS_TEXT[status],
      componentId: target && 'componentId' in target ? target.componentId : null, target,
      rule: entry ? { level: entry.rule.scope.level, ruleId: entry.rule.ruleId, kind: ruleKind(entry) } : null,
      certainty: entry?.certainty ?? null, conflicts: rowConflicts, issues, overlap,
      overriddenBy: saveScope === 'model' && entry?.rule.scope.level === 'equipment' ? entry.rule.ruleId : null,
    };
  });
  const own = new Set(resolved.aliases.flatMap((row) => row.issues.map(issueKey)));
  const roles = [...new Set(rows.map(({ role }) => role))].sort((a, b) =>
    Number(b === 'unknown') - Number(a === 'unknown') || compareNatural(a, b));
  return {
    rows, saveScopeFile, missingTemplate, drafts: [...draftedBy.keys()].sort(compareNatural),
    groups: roles.map((role) => ({ role, rows: rows.filter((row) => row.role === role).sort((a, b) => compareNatural(a.alias, b.alias)) })),
    unattributed: resolved.issues.filter((issue) => !own.has(issueKey(issue))),
  };
}

/** Writes the target for `alias` into the scope file: updates its own exact rule, splits a shared one, or adds one. */
function upsertExact(file: AliasRulesFile, alias: string, target: AliasRule['target'], certainty: AliasRule['certainty']): AliasRulesFile {
  const index = file.rules.findIndex(({ match }) => 'exact' in match && match.exact.includes(alias));
  const existing = file.rules[index];
  if (existing && 'exact' in existing.match && existing.match.exact.length === 1) {
    return { ...file, rules: file.rules.map((rule, i) => i === index ? { ...existing, target, certainty } : rule) };
  }
  const rules = existing && 'exact' in existing.match
    ? file.rules.map((rule, i) => i === index ? { ...existing, match: { exact: (existing.match as { exact: string[] }).exact.filter((name) => name !== alias) } } : rule)
    : [...file.rules];
  const id = freshId(alias, new Set(rules.map((rule) => rule.id)));
  return { ...file, rules: [...rules, { id, match: { exact: [alias] }, target, certainty }] };
}

/** One history entry per edit; an edit that changes nothing leaves the state (and its history) untouched. */
export function applyEdit(input: BoardInput, state: BoardState, saveScope: SaveScope, edit: BoardEdit): BoardState {
  const view = resolveBoard(input, state.present, saveScope);
  const row = view.rows.find(({ alias }) => alias === edit.alias);
  if (!row) return state;
  let target: AliasRule['target'];
  if (edit.kind === 'assign') {
    const slots = row.target && 'componentId' in row.target && row.target.componentId === edit.componentId ? row.target.slots : undefined;
    target = slots ? { componentId: edit.componentId, slots } : { componentId: edit.componentId };
  } else if (edit.kind === 'ignore') {
    target = { ignore: true };
  } else {
    if (!row.target || !row.rule) return state;
    const pinned = row.rule.kind === 'exact' && row.certainty === 'verified' && row.rule.level === saveScope;
    if (pinned) return state;
    target = row.target;
  }
  const file = upsertExact(state.present[saveScope], edit.alias, target, 'verified');
  if (same(file, state.present[saveScope])) return state;
  return { ...state, present: { ...state.present, [saveScope]: file }, past: [...state.past, state.present], future: [] };
}

/** The files to write: every scope that differs from its baseline, plus the save scope when drafts exist. */
export function buildSavePayload(input: BoardInput, state: BoardState, saveScope: SaveScope): SavePayload {
  const view = resolveBoard(input, state.present, saveScope);
  const dirty = new Set(dirtyScopes(state));
  if (view.drafts.length) dirty.add(saveScope);
  return {
    source: state.present,
    files: SCOPES.filter((scope) => dirty.has(scope)).map((scope) => ({ scope, file: scope === saveScope ? view.saveScopeFile : state.present[scope] })),
  };
}
export const canSave = (input: BoardInput, state: BoardState, saveScope: SaveScope): boolean =>
  buildSavePayload(input, state, saveScope).files.length > 0;

/** Moves only the acknowledged scopes' baselines, to the submitted contents; other scopes stay dirty. */
export function applySaveOutcome(state: BoardState, payload: SavePayload, outcome: Pick<SaveOutcome, 'savedScopes'>): BoardState {
  const acknowledged = payload.files.filter(({ scope }) => outcome.savedScopes.includes(scope));
  if (!acknowledged.length) return state;
  const baseline = { ...state.baseline };
  const present = { ...state.present };
  for (const { scope, file } of acknowledged) {
    baseline[scope] = file;
    // Edits are locked while a save is pending, so unchanged pending files take on the written drafts.
    if (same(state.present[scope], payload.source[scope])) present[scope] = file;
  }
  return { ...state, baseline, present };
}

export interface PaletteOption { id: string; label: string; role: string }
/** Layout components for the assign palette: the alias's Role first, then natural id order. */
export function paletteOptions(layout: EquipmentLayoutDocument, role: string, filter: string): PaletteOption[] {
  const needle = filter.trim().toLowerCase();
  return layout.components.filter((component) => !needle ||
    [component.id, component.label, component.role].some((text) => text.toLowerCase().includes(needle)))
    .map(({ id, label, role: componentRole }) => ({ id, label, role: componentRole }))
    .sort((a, b) => Number(b.role === role) - Number(a.role === role) || compareNatural(a.id, b.id));
}

/** One Korean line per conflict, resolution issue or overlap of a row. */
export function explainRow(row: BoardRow): string[] {
  const lines = row.conflicts.map((conflict): string => {
    switch (conflict.kind) {
      case 'transfer-without-capability':
        return `이송 ${conflict.from} → ${conflict.to} (${conflict.count}건): ${conflict.fromComponentId}와 ${conflict.toComponentId} 사이에 Transfer Capability가 없습니다`;
      case 'slot-exceeds-sites':
        return `slot ${conflict.slots.join(', ')}에 해당하는 Holding Site가 ${conflict.componentId}에 없습니다`;
      case 'role-mismatch':
        return `Role 불일치: ${conflict.moduleType}은(는) ${conflict.expectedRole}이어야 하지만 ${conflict.componentId}는 ${conflict.componentRole}입니다`;
      case 'port-flag-mismatch':
        return `Port 표시 불일치: 관측된 isPort=${conflict.isPort}이(가) ${conflict.componentId}의 Holding Site 구성과 다릅니다`;
      case 'robot-flag-mismatch':
        return `Robot 표시 불일치: 관측된 isRobot=${conflict.isRobot}이(가) ${conflict.componentId}의 Role과 다릅니다`;
    }
  });
  for (const issue of row.issues) {
    lines.push(issue.code === 'same-level-overlap'
      ? `같은 범위의 규칙이 겹칩니다: ${row.overlap.map(({ ruleId }) => ruleId).join(', ')}`
      : issue.code === 'unknown-target' ? `규칙의 대상이 layout에 없습니다 (${issue.message})` : `규칙 문제 (${issue.code}): ${issue.message}`);
  }
  return lines;
}
