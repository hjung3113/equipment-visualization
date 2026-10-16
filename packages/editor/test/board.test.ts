import { expect, it } from 'vitest';
import { validateAliasRules } from '@eqv/core';
import {
  applyEdit, applySaveOutcome, buildSavePayload, createBoardState, dirtyScopes, isDirty, redo, resolveBoard, ruleSlug, undo,
  type BoardEdit, type BoardInput, type BoardState, type SaveScope,
} from '../src/board.js';
import { boardInput, fixtureLayout, modelRules, templateDraft } from './board-data.js';

const view = (input: BoardInput, state = createBoardState(input), scope: SaveScope = 'model') => resolveBoard(input, state.present, scope);
const row = (input: BoardInput, alias: string, state?: BoardState, scope?: SaveScope) => view(input, state, scope).rows.find((r) => r.alias === alias)!;
const edit = (input: BoardInput, state: BoardState, scope: SaveScope, change: BoardEdit) => applyEdit(input, state, scope, change);
const valid = (state: BoardState) => {
  for (const file of Object.values(state.present)) expect(validateAliasRules(file).ok, JSON.stringify(validateAliasRules(file))).toBe(true);
};
const noRules = () => boardInput({ ruleFiles: {}, layout: templateDraft() });

it('shows the fixture statuses with symbol and text', () => {
  const input = boardInput();
  expect(Object.fromEntries(view(input).rows.map((r) => [r.alias, r.statusText]))).toEqual({
    EFEM_R1: '● 확정', LLA: '● 확정', LP1: '● 확정', PM1: '● 확정', PM2: '◐ 자동', PM9: '○ 미매핑', TM_R1: '● 확정', VIRT_SCH: '⊘ 무시',
  });
  expect(row(input, 'PM1')).toMatchObject({ componentId: 'pm-a', rule: { level: 'model', ruleId: 'pm-pattern', kind: 'pattern' }, certainty: 'verified' });
  expect(row(input, 'PM2')).toMatchObject({ componentId: 'pm-b', rule: { level: 'equipment', ruleId: 'pm-two-assumed', kind: 'exact' }, overriddenBy: 'pm-two-assumed' });
  expect(row(input, 'PM9')).toMatchObject({ componentId: null, rule: null, draft: false });
});

it('groups by Role with unknown first, then natural order', () => {
  expect(view(boardInput()).groups.map(({ role, rows }) => [role, rows.map((r) => r.alias)])).toEqual([
    ['unknown', ['VIRT_SCH']], ['ll', ['LLA']], ['lp', ['LP1']], ['pm', ['PM1', 'PM2', 'PM9']], ['robot', ['EFEM_R1', 'TM_R1']],
  ]);
});

it('marks an alias assigned to a component of the wrong role as a conflict with a Korean line', () => {
  const input = boardInput();
  const state = edit(input, createBoardState(input), 'model', { kind: 'assign', alias: 'PM9', componentId: 'lp-a' });
  expect(row(input, 'PM9', state)).toMatchObject({ status: 'conflict', statusText: '⚠ 충돌', componentId: 'lp-a', certainty: 'verified' });
  expect(row(input, 'PM9', state).conflicts).toContainEqual(expect.objectContaining({ kind: 'role-mismatch', expectedRole: 'pm', componentRole: 'lp' }));
});

it('treats resolution issues and same-level overlap as conflicts and keeps unattributed issues apart', () => {
  const input = boardInput();
  const state = createBoardState(input);
  const bad = { ...state.present.model, rules: [
    ...state.present.model.rules,
    { id: 'zz-a', match: { exact: ['PM9'] }, target: { componentId: 'pm-zz' }, certainty: 'assumed' as const },
    { id: 'unused', match: { exact: ['NOT-OBSERVED'] }, target: { componentId: 'pm-yy' }, certainty: 'assumed' as const },
  ] };
  const next = { ...state, present: { ...state.present, model: bad } };
  const result = view(input, next);
  expect(result.rows.find((r) => r.alias === 'PM9')).toMatchObject({ status: 'conflict', issues: [expect.objectContaining({ code: 'unknown-target' })] });
  expect(result.unattributed.map(({ path }) => path[3])).toEqual([result.unattributed[0]!.path[3]]);
  expect(result.unattributed).toHaveLength(1);
  const overlapping = { ...state.present.model, rules: [
    ...state.present.model.rules,
    { id: 'pm9-a', match: { pattern: 'PM{n}' }, target: { componentId: 'pm-a' }, certainty: 'assumed' as const },
  ] };
  const both = row(input, 'PM1', { ...state, present: { ...state.present, model: overlapping } });
  expect(both).toMatchObject({ status: 'conflict', componentId: null });
  expect(both.overlap).toHaveLength(2);
});

it('shows a transfer without capability as a conflict on both aliases', () => {
  const input = boardInput();
  const state = edit(input, createBoardState(input), 'model', { kind: 'assign', alias: 'LLA', componentId: 'pm-b' });
  for (const alias of ['LLA', 'LP1']) {
    expect(row(input, alias, state)).toMatchObject({ status: 'conflict', conflicts: expect.arrayContaining([expect.objectContaining({ kind: 'transfer-without-capability' })]) });
  }
  expect(row(input, 'EFEM_R1', state).status).toBe('verified');
});

it('proposes unsaved automatic assignments from the template and leaves the rest unmapped', () => {
  const input = noRules();
  const result = view(input);
  expect(result.rows.filter((r) => r.draft).map((r) => [r.alias, r.componentId, r.statusText, r.certainty])).toEqual([
    ['EFEM_R1', 'efem-robot', '◐ 자동 (미저장)', 'assumed'], ['LLA', 'll-a', '◐ 자동 (미저장)', 'assumed'], ['LP1', 'lp-a', '◐ 자동 (미저장)', 'assumed'],
    ['PM1', 'pm-a', '◐ 자동 (미저장)', 'assumed'], ['PM2', 'pm-b', '◐ 자동 (미저장)', 'assumed'], ['TM_R1', 'tm-robot', '◐ 자동 (미저장)', 'assumed'],
  ].sort((a, b) => a[0]! < b[0]! ? -1 : 1));
  expect(row(input, 'PM9').statusText).toBe('○ 미매핑');
  expect(view(input).missingTemplate).toBeNull();
  expect(isDirty(createBoardState(input))).toBe(false);
});

it('drops a draft whose component is missing from the layout', () => {
  const layout = templateDraft();
  layout.components = layout.components.filter(({ id }) => id !== 'pm-a');
  layout.transferCapabilities = layout.transferCapabilities.filter(({ a, b }) => a.componentId !== 'pm-a' && b.componentId !== 'pm-a');
  expect(row(boardInput({ ruleFiles: {}, layout }), 'PM1')).toMatchObject({ draft: false, status: 'unmapped' });
});

it('gives no drafts and names the template when it is not available', () => {
  const input = boardInput({ ruleFiles: {}, layout: templateDraft(), templates: [] });
  expect(view(input)).toMatchObject({ missingTemplate: 'cluster-single', drafts: [] });
  expect(view(input).rows.every((r) => r.status === 'unmapped')).toBe(true);
});

it('uses the Generic Layout assignments when the layout is generic', async () => {
  const { buildGenericLayout } = await import('@eqv/core');
  const { inventory, dictionaries } = boardInput();
  const { layout } = buildGenericLayout({ inventory, dictionaries: [...dictionaries] });
  const result = view(boardInput({ ruleFiles: {}, layout }));
  expect(result.drafts).toHaveLength(inventory.aliases.length);
  expect(result.rows.every((r) => r.draft && r.componentId !== null)).toBe(true);
  // The Generic Layout draws no Transfer Capability, so the observed transfers show as conflicts, not as agreement.
  expect(result.rows.find((r) => r.alias === 'LP1')!.status).toBe('conflict');
});

it('does not draft over an alias that a rule already matches', () => {
  const input = boardInput({ layout: templateDraft() });
  expect(row(input, 'PM1')).toMatchObject({ draft: false, statusText: '● 확정' });
});

it.each<['model' | 'equipment', string]>([['model', 'model'], ['equipment', 'equipment']])('assign, confirm and ignore write only the %s file', (scope) => {
  const input = boardInput();
  const initial = createBoardState(input);
  const other: SaveScope = scope === 'model' ? 'equipment' : 'model';
  let state = edit(input, initial, scope, { kind: 'assign', alias: 'PM9', componentId: 'pm-b' });
  expect(state.present[other]).toBe(initial.present[other]);
  expect(state.present[scope].rules.at(-1)).toEqual({ id: 'board-pm9', match: { exact: ['PM9'] }, target: { componentId: 'pm-b' }, certainty: 'verified' });
  state = edit(input, state, scope, { kind: 'ignore', alias: 'PM9' });
  expect(state.present[scope].rules.filter(({ id }) => id === 'board-pm9')).toEqual([
    { id: 'board-pm9', match: { exact: ['PM9'] }, target: { ignore: true }, certainty: 'verified' }]);
  expect(state.past).toHaveLength(2);
  valid(state);
});

it('updates the alias own single-alias rule in place and keeps its id', () => {
  const input = boardInput();
  const state = edit(input, createBoardState(input), 'equipment', { kind: 'assign', alias: 'PM2', componentId: 'pm-a' });
  expect(state.present.equipment.rules).toEqual([expect.objectContaining({ id: 'pm-two-assumed', target: { componentId: 'pm-a' }, certainty: 'verified' })]);
});

it('splits an alias out of a multi-alias exact rule and never edits a pattern rule', () => {
  const input = boardInput();
  const initial = createBoardState(input);
  const shared = { ...initial.present.model, rules: [
    ...initial.present.model.rules,
    { id: 'shared', match: { exact: ['PM9', 'PM8'] }, target: { componentId: 'pm-a' }, certainty: 'assumed' as const },
  ] };
  let state = edit(input, { ...initial, present: { ...initial.present, model: shared } }, 'model', { kind: 'assign', alias: 'PM9', componentId: 'pm-b' });
  const rules = state.present.model.rules;
  expect(rules.find(({ id }) => id === 'shared')!.match).toEqual({ exact: ['PM8'] });
  expect(rules.at(-1)).toMatchObject({ id: 'board-pm9', match: { exact: ['PM9'] }, target: { componentId: 'pm-b' } });
  const pattern = modelRules().rules.find(({ id }) => id === 'pm-pattern');
  state = edit(input, state, 'model', { kind: 'assign', alias: 'PM1', componentId: 'pm-b' });
  expect(state.present.model.rules.find(({ id }) => id === 'pm-pattern')).toEqual(pattern);
  expect(state.present.model.rules.at(-1)).toMatchObject({ id: 'board-pm1', target: { componentId: 'pm-b' } });
  valid(state);
});

it.each([
  { name: 'keeps the slots when the component stays', componentId: 'lp-a', slots: true },
  { name: 'drops the slots when the component changes', componentId: 'lp-b', slots: false },
])('assign $name', ({ componentId, slots }) => {
  const layout = fixtureLayout();
  layout.components.push({ ...layout.components.find(({ id }) => id === 'lp-a')!, id: 'lp-b' });
  const input = boardInput({ layout });
  const state = edit(input, createBoardState(input), 'model', { kind: 'assign', alias: 'LP1', componentId });
  expect(state.present.model.rules.find(({ id }) => id === 'lp')!.match).toEqual({ exact: ['LP1'] });
  expect(state.present.model.rules.find(({ id }) => id === 'lp')!.target).toEqual(
    slots ? modelRules().rules.find(({ id }) => id === 'lp')!.target : { componentId });
});

it('confirm pins the effective target, keeps slots, and does nothing for unmapped or already pinned aliases', () => {
  const input = boardInput();
  const initial = createBoardState(input);
  const confirmed = edit(input, initial, 'equipment', { kind: 'confirm', alias: 'PM2' });
  expect(confirmed.present.equipment.rules[0]).toMatchObject({ id: 'pm-two-assumed', certainty: 'verified', target: { componentId: 'pm-b', slots: expect.anything() } });
  expect(edit(input, confirmed, 'equipment', { kind: 'confirm', alias: 'PM2' })).toBe(confirmed);
  expect(edit(input, initial, 'model', { kind: 'confirm', alias: 'PM9' })).toBe(initial);
  const lp = edit(input, initial, 'model', { kind: 'confirm', alias: 'LP1' });
  expect(lp).toBe(initial);
  const pattern = edit(input, initial, 'model', { kind: 'confirm', alias: 'PM1' });
  expect(pattern.present.model.rules.at(-1)).toMatchObject({ id: 'board-pm1', match: { exact: ['PM1'] }, target: { componentId: 'pm-a' }, certainty: 'verified' });
});

it('confirms a draft as a verified rule', () => {
  const input = noRules();
  const state = edit(input, createBoardState(input), 'model', { kind: 'confirm', alias: 'PM1' });
  expect(state.present.model.rules).toEqual([{ id: 'board-pm1', match: { exact: ['PM1'] }, target: { componentId: 'pm-a' }, certainty: 'verified' }]);
  expect(row(input, 'PM1', state).statusText).toBe('● 확정');
});

it.each([
  ['TM_R1', 'board-tm-r1'], ['  p m/9 ', 'board-p-m-9'], ['한글', 'board-alias'], ['A__B', 'board-a-b'],
])('derives the rule id for %s', (alias, id) => {
  expect(ruleSlug(alias)).toBe(id);
});

it('numbers a colliding rule id', () => {
  const input = boardInput();
  const initial = createBoardState(input);
  const taken = { ...initial.present.model, rules: [...initial.present.model.rules,
    { id: 'board-pm9', match: { exact: ['x'] }, target: { ignore: true as const }, certainty: 'assumed' as const },
    { id: 'board-pm9-2', match: { exact: ['y'] }, target: { ignore: true as const }, certainty: 'assumed' as const }] };
  const twin = boardInput();
  twin.inventory.aliases.push({ ...twin.inventory.aliases.find(({ alias }) => alias === 'PM9')!, alias: 'PM-9' });
  const fresh = edit(twin, { ...initial, present: { ...initial.present, model: taken } }, 'model', { kind: 'assign', alias: 'PM9', componentId: 'pm-b' });
  expect(fresh.present.model.rules.at(-1)!.id).toBe('board-pm9-3');
  const second = edit(twin, fresh, 'model', { kind: 'assign', alias: 'PM-9', componentId: 'pm-b' });
  expect(second.present.model.rules.at(-1)!.id).toBe('board-pm-9');
  const clash = edit(twin, { ...initial, present: { ...initial.present, model: { ...taken, rules: [...taken.rules,
    { id: 'board-pm-9', match: { exact: ['q'] }, target: { ignore: true as const }, certainty: 'assumed' as const }] } } }, 'model', { kind: 'assign', alias: 'PM-9', componentId: 'pm-b' });
  expect(clash.present.model.rules.at(-1)!.id).toBe('board-pm-9-2');
});

it('says an Equipment-scope rule overrides a Model-scope assignment', () => {
  const input = boardInput();
  const state = edit(input, createBoardState(input), 'model', { kind: 'assign', alias: 'PM2', componentId: 'pm-a' });
  expect(row(input, 'PM2', state, 'model')).toMatchObject({ componentId: 'pm-b', overriddenBy: 'pm-two-assumed', rule: { ruleId: 'pm-two-assumed' } });
  expect(row(input, 'PM2', state, 'equipment').overriddenBy).toBeNull();
});

it('undoes and redoes the exact files and returns to clean', () => {
  const input = boardInput();
  const initial = createBoardState(input);
  const a = edit(input, initial, 'model', { kind: 'assign', alias: 'PM9', componentId: 'pm-b' });
  const b = edit(input, a, 'equipment', { kind: 'ignore', alias: 'PM9' });
  expect(dirtyScopes(b)).toEqual(['model', 'equipment']);
  expect(undo(b).present).toBe(a.present);
  expect(dirtyScopes(undo(b))).toEqual(['model']);
  const back = undo(undo(b));
  expect(back.present).toBe(initial.present);
  expect(isDirty(back)).toBe(false);
  expect(redo(redo(back)).present).toBe(b.present);
  expect(redo(redo(redo(back)))).toEqual(redo(redo(back)));
  expect(edit(input, undo(b), 'model', { kind: 'ignore', alias: 'PM9' }).future).toEqual([]);
});

it('treats a missing file as an empty one and a pending draft as not dirty', () => {
  const input = noRules();
  const state = createBoardState(input);
  expect(state.present.model).toEqual({ schemaVersion: '0.4', scope: { level: 'model', maker: 'synth-maker', model: 'synth-model' }, rules: [] });
  expect(isDirty(state)).toBe(false);
});

it('saves only the changed scopes, and the save scope file also carries the drafts', () => {
  const input = boardInput();
  const initial = createBoardState(input);
  expect(buildSavePayload(input, initial, 'model').files).toEqual([]);
  const changed = edit(input, initial, 'equipment', { kind: 'assign', alias: 'PM9', componentId: 'pm-b' });
  expect(buildSavePayload(input, changed, 'model').files.map(({ scope }) => scope)).toEqual(['equipment']);
  const drafted = noRules();
  const state = createBoardState(drafted);
  const payload = buildSavePayload(drafted, state, 'equipment');
  expect(payload.files.map(({ scope }) => scope)).toEqual(['equipment']);
  expect(payload.files[0]!.file.rules).toHaveLength(6);
  expect(payload.files[0]!.file.rules.every((r) => r.certainty === 'assumed' && r.id.startsWith('board-') && 'exact' in r.match)).toBe(true);
  expect(validateAliasRules(payload.files[0]!.file).ok).toBe(true);
});

it('keeps unsaved scopes dirty after a partial save and compares undo against the acknowledged baseline', () => {
  const input = boardInput();
  const initial = createBoardState(input);
  const a = edit(input, initial, 'model', { kind: 'assign', alias: 'PM9', componentId: 'pm-b' });
  const b = edit(input, a, 'equipment', { kind: 'ignore', alias: 'PM9' });
  const payload = buildSavePayload(input, b, 'model');
  expect(payload.files.map(({ scope }) => scope)).toEqual(['model', 'equipment']);
  const saved = applySaveOutcome(b, payload, { savedScopes: ['equipment'] });
  expect(dirtyScopes(saved)).toEqual(['model']);
  expect(saved.past).toHaveLength(2);
  expect(buildSavePayload(input, saved, 'model').files.map(({ scope }) => scope)).toEqual(['model']);
  // Undo to the state before the equipment edit: equipment now differs from the acknowledged baseline.
  expect(dirtyScopes(undo(saved))).toEqual(['model', 'equipment']);
  expect(dirtyScopes(redo(undo(saved)))).toEqual(['model']);
});

it('moves a baseline to the submitted contents even when pending changed meanwhile', () => {
  const input = boardInput();
  const a = edit(input, createBoardState(input), 'model', { kind: 'assign', alias: 'PM9', componentId: 'pm-b' });
  const payload = buildSavePayload(input, a, 'model');
  const later = edit(input, a, 'model', { kind: 'ignore', alias: 'PM9' });
  const saved = applySaveOutcome(later, payload, { savedScopes: ['model'] });
  expect(saved.baseline.model).toBe(payload.files[0]!.file);
  expect(dirtyScopes(saved)).toEqual(['model']);
});

it('folds written drafts into the pending file once saved', () => {
  const input = noRules();
  const state = createBoardState(input);
  const payload = buildSavePayload(input, state, 'model');
  const saved = applySaveOutcome(state, payload, { savedScopes: ['model'] });
  expect(isDirty(saved)).toBe(false);
  expect(buildSavePayload(input, saved, 'model').files).toEqual([]);
  const after = resolveBoard({ ...input, ruleFiles: { model: saved.present.model } }, saved.present, 'model');
  expect(after.rows.filter((r) => r.statusText === '◐ 자동')).toHaveLength(6);
});
