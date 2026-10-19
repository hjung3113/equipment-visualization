// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { validateAliasRules } from '@eqv/core';
import { MappingBoard, type MappingBoardProps, type SaveOutcome } from '../src/index.js';
import { boardInput, equipmentRules, templateDraft } from './board-data.js';

afterEach(cleanup);

const mount = (onSave: MappingBoardProps['onSave'] = async (files) => ({ savedScopes: files.map(({ scope }) => scope) }), extra: Partial<MappingBoardProps> = {}) => {
  const spy = vi.fn(onSave);
  const result = render(<MappingBoard {...boardInput()} onSave={spy} {...extra} />);
  return { spy, ...result };
};
const list = () => screen.getByRole('listbox', { name: 'Alias 목록' });
const option = (alias: string) => within(list()).getByRole('option', { name: new RegExp(`^${alias},`) });
const press = (target: Element, key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(target, { key, ...init });
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const selectedAlias = () => list().querySelector('[aria-selected="true"]')?.id;
const component = (container: HTMLElement, id: string) => container.querySelector(`[data-component-id="${id}"]`)!;
const choose = (id: string) => fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('option').find((row) => row.querySelector('code')!.textContent === id)!);
const scopesOf = (spy: ReturnType<typeof mount>['spy']) => spy.mock.calls.map(([files]) => files.map(({ scope }) => scope));

it('goes from load to onSave with the keyboard alone', async () => {
  const { spy } = mount();
  list().focus();
  expect(document.activeElement).toBe(list());
  expect(list().getAttribute('aria-activedescendant')).toBeNull();
  press(list(), 'j');
  expect(option('VIRT_SCH').getAttribute('aria-selected')).toBe('true');
  for (const key of ['j', 'j', 'j', 'j', 'j']) press(list(), key);
  press(list(), 'k');
  press(list(), 'j');
  expect(option('PM9').getAttribute('aria-selected')).toBe('true');
  expect(list().getAttribute('aria-activedescendant')).toBe(option('PM9').id);
  press(list(), 'a');
  const dialog = screen.getByRole('dialog');
  const filter = within(dialog).getByRole('combobox');
  expect(document.activeElement).toBe(filter);
  fireEvent.change(filter, { target: { value: 'pm-b' } });
  press(filter, 'Enter');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(list());
  expect(option('PM9').textContent).toContain('● 확정');
  expect(option('PM9').textContent).toContain('pm-b');
  expect(option('PM9').getAttribute('aria-selected')).toBe('true');
  for (const key of ['k', 'k', 'k']) press(list(), key);
  expect(option('LP1').getAttribute('aria-selected')).toBe('true');
  press(list(), 'i');
  expect(option('LP1').textContent).toContain('⊘ 무시');
  press(list(), 'j');
  press(list(), 'j');
  expect(option('PM2').getAttribute('aria-selected')).toBe('true');
  press(list(), 'Enter');
  press(list(), 'z', { ctrlKey: true });
  expect(button('다시 실행').disabled).toBe(false);
  press(list(), 'z', { ctrlKey: true, shiftKey: true });
  expect(button('다시 실행').disabled).toBe(true);
  button('저장').focus();
  expect(document.activeElement).toBe(button('저장'));
  fireEvent.click(button('저장'));
  await act(async () => {});
  expect(spy).toHaveBeenCalledTimes(1);
  const files = spy.mock.calls[0]![0];
  expect(files.map(({ scope }) => scope)).toEqual(['model']);
  for (const { file } of files) expect(validateAliasRules(file).ok).toBe(true);
  const rules = files[0]!.file.rules;
  expect(rules.find(({ id }) => id === 'board-pm9')).toMatchObject({ target: { componentId: 'pm-b' }, certainty: 'verified' });
  expect(rules.find(({ id }) => id === 'lp')).toMatchObject({ target: { ignore: true }, certainty: 'verified' });
  // PM2 already has its own exact Model rule: confirming pins the equipment rule's target there, in place.
  expect(rules.find(({ id }) => id === 'pm-two')).toMatchObject({ target: equipmentRules().rules[0]!.target, certainty: 'verified' });
  expect(screen.getByRole('status').textContent).toBe('저장됨');
}, 20_000); // #78: first test of the file absorbs jsdom warm-up on a loaded CI runner

it('assigns by dropping an alias row on a component of the Top View', () => {
  const { container } = mount();
  const data = { setData: vi.fn(), getData: vi.fn(() => 'PM9'), effectAllowed: '', dropEffect: '' };
  fireEvent.dragStart(option('PM9'), { dataTransfer: data });
  fireEvent.dragOver(component(container, 'pm-b'), { dataTransfer: data });
  fireEvent.drop(component(container, 'pm-b'), { dataTransfer: data });
  expect(option('PM9').textContent).toContain('pm-b');
  expect(option('PM9').textContent).toContain('● 확정');
});

it('marks the aliases assigned to a clicked component and selects the component of a chosen alias', () => {
  const { container } = mount();
  fireEvent.click(component(container, 'pm-a'));
  expect(option('PM1').getAttribute('aria-label')).toMatch(/, 선택한 component에 배정됨$/);
  expect(option('PM1').querySelector('[data-marker="assigned"]')).not.toBeNull();
  expect(option('PM2').getAttribute('aria-label')).not.toMatch(/선택한 component/);
  expect(component(container, 'pm-a').getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(option('PM2'));
  expect(component(container, 'pm-b').getAttribute('aria-pressed')).toBe('true');
  expect(component(container, 'pm-a').getAttribute('aria-pressed')).toBe('false');
  expect(option('PM2').querySelector('[data-marker="assigned"]')).not.toBeNull();
});

it('writes the scope that the toggle selects', async () => {
  const { spy } = mount();
  fireEvent.click(screen.getByRole('radio', { name: /^설비 \(eq-synth-01\)$/ }));
  fireEvent.click(option('PM9'));
  fireEvent.click(button('배정 (A)'));
  choose('pm-b');
  fireEvent.click(button('저장'));
  await act(async () => {});
  expect(scopesOf(spy)).toEqual([['equipment']]);
  expect(spy.mock.calls[0]![0][0]!.file.rules.at(-1)).toMatchObject({ id: 'board-pm9' });
  expect(screen.getByRole('radio', { name: /^Model \(synth-maker\/synth-model\)$/ })).toBeTruthy();
});

it('keeps an unsaved scope dirty after a partial save, shows the error and retries only that scope', async () => {
  const outcomes: SaveOutcome[] = [{ savedScopes: ['equipment'], error: '모델 저장 실패' }, { savedScopes: ['model'] }];
  const onDirtyChange = vi.fn();
  const { spy } = mount(async () => outcomes.shift()!, { onDirtyChange });
  fireEvent.click(option('PM9'));
  press(list(), 'i');
  fireEvent.click(screen.getByRole('radio', { name: /^설비/ }));
  press(list(), 'i');
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  fireEvent.click(button('저장'));
  await act(async () => {});
  expect(screen.getByRole('alert').textContent).toBe('모델 저장 실패');
  expect(button('저장').disabled).toBe(false);
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  fireEvent.click(button('저장'));
  await act(async () => {});
  expect(scopesOf(spy)).toEqual([['model', 'equipment'], ['model']]);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
});

it('compares undo with the acknowledged baseline after a partial save', async () => {
  const { spy } = mount(async () => ({ savedScopes: ['equipment'], error: 'x' }));
  fireEvent.click(option('PM9'));
  press(list(), 'i');
  fireEvent.click(screen.getByRole('radio', { name: /^설비/ }));
  press(list(), 'a');
  choose('pm-b');
  fireEvent.click(button('저장'));
  await act(async () => {});
  // Equipment is acknowledged: only the model file is still pending.
  fireEvent.click(button('실행 취소'));
  fireEvent.click(button('저장'));
  await act(async () => {});
  // Undoing the equipment edit moves equipment away from its acknowledged baseline, so it is submitted again.
  expect(scopesOf(spy)).toEqual([['model', 'equipment'], ['model', 'equipment']]);
});

it.each([
  ['resolves', (release: (value: SaveOutcome) => void) => release({ savedScopes: ['model'] })],
  ['rejects', (_release: (value: SaveOutcome) => void, fail: (error: Error) => void) => fail(new Error('네트워크 오류'))],
])('locks the edit controls while a save is pending and unlocks when it %s', async (_name, settle) => {
  let release!: (value: SaveOutcome) => void;
  let fail!: (error: Error) => void;
  const { spy } = mount(() => new Promise<SaveOutcome>((resolve, reject) => { release = resolve; fail = reject; }));
  fireEvent.click(option('PM9'));
  press(list(), 'i');
  fireEvent.click(button('저장'));
  const locked = [button('배정 (A)'), button('확정 (Enter)'), button('무시 (I)'), button('실행 취소'), button('다시 실행'), button('저장'),
    ...screen.getAllByRole('radio')] as HTMLInputElement[];
  for (const control of locked) expect(control.disabled, control.textContent || control.name).toBe(true);
  expect(option('PM9').getAttribute('draggable')).toBe('false');
  press(list(), 'i');
  press(list(), 'z', { ctrlKey: true });
  fireEvent.click(button('저장'));
  expect(spy).toHaveBeenCalledTimes(1);
  expect(option('PM9').textContent).toContain('⊘ 무시');
  await act(async () => settle(release, fail));
  // A saved scope has nothing left to write; a rejected save leaves the edit unsaved and savable again.
  expect(button('저장').disabled).toBe(_name === 'resolves');
  expect(button('배정 (A)').disabled).toBe(false);
  expect(screen.getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).disabled)).toBe(true);
});

it('ignores a save outcome that arrives after unmount', async () => {
  let release!: (value: SaveOutcome) => void;
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { unmount } = mount(() => new Promise<SaveOutcome>((resolve) => { release = resolve; }));
  fireEvent.click(option('PM9'));
  press(list(), 'i');
  fireEvent.click(button('저장'));
  unmount();
  await act(async () => release({ savedScopes: ['model'] }));
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});

it('leaves Enter and arrow keys to the control that owns them', () => {
  const { spy, container } = mount();
  fireEvent.click(option('PM2'));
  const before = selectedAlias();
  press(button('저장'), 'Enter');
  expect(button('실행 취소').disabled).toBe(true);
  press(container.querySelector('svg')!, 'ArrowDown');
  press(component(container, 'pm-a'), 'ArrowDown');
  expect(selectedAlias()).toBe(before);
  expect(button('실행 취소').disabled).toBe(true);
  press(list(), 'a');
  const filter = screen.getByRole('combobox');
  press(filter, 'Enter');
  // One edit from the palette's Enter: assigned, not also confirmed.
  fireEvent.click(button('실행 취소'));
  expect(button('실행 취소').disabled).toBe(true);
  expect(spy).not.toHaveBeenCalled();
});

it('assigns once from the arrow-selected palette option, and Esc closes without assigning', () => {
  mount();
  fireEvent.click(option('PM9'));
  press(list(), 'a');
  const filter = screen.getByRole('combobox');
  const options = within(screen.getByRole('dialog')).getAllByRole('option');
  // The alias's Role (pm) comes first, then natural id order.
  expect(options.slice(0, 2).map((row) => row.querySelector('code')!.textContent)).toEqual(['pm-a', 'pm-b']);
  press(filter, 'ArrowDown');
  expect(filter.getAttribute('aria-activedescendant')).toBe(options[1]!.id);
  press(filter, 'Escape');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(button('실행 취소').disabled).toBe(true);
  expect(document.activeElement).toBe(list());
  expect(option('PM9').getAttribute('aria-selected')).toBe('true');
  press(list(), 'a');
  press(screen.getByRole('combobox'), 'ArrowDown');
  press(screen.getByRole('combobox'), 'Enter');
  expect(option('PM9').textContent).toContain('pm-b');
  fireEvent.click(button('실행 취소'));
  expect(button('실행 취소').disabled).toBe(true);
});

it('keeps Tab inside the palette dialog', () => {
  mount();
  fireEvent.click(option('PM9'));
  press(list(), 'a');
  const filter = screen.getByRole('combobox');
  const close = button('닫기');
  // jsdom does not move focus on Tab; the browser follows DOM order, so the icon button must come right after the footer one.
  expect(close.compareDocumentPosition(button('창 닫기')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  button('창 닫기').focus();
  press(button('창 닫기'), 'Tab');
  expect(document.activeElement).toBe(filter);
  press(filter, 'Tab', { shiftKey: true });
  expect(document.activeElement).toBe(button('창 닫기'));
  expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
});

it('shows the Korean explanation and the override notice for the selected alias', () => {
  mount();
  fireEvent.click(option('PM2'));
  const pane = () => screen.getByRole('region', { name: '선택한 항목' });
  expect(pane().textContent).toContain('설비 범위 규칙(pm-two-assumed)이 우선합니다');
  expect(pane().textContent).toContain('설비 · pm-two-assumed · 정확');
  fireEvent.click(option('PM9'));
  press(list(), 'a');
  choose('lp-a');
  expect(pane().textContent).toMatch(/Role 불일치/);
  expect(option('PM9').textContent).toContain('⚠ 충돌');
});

it('UX-1 never marks an alias whose effective target is absent from the layout', () => {
  const input = boardInput();
  input.ruleFiles.model = { ...input.ruleFiles.model!, rules: input.ruleFiles.model!.rules.map((rule) =>
    rule.id === 'lp' ? { ...rule, target: { componentId: 'missing-lp' } } : rule) };
  mount(undefined, input);
  fireEvent.click(option('LP1'));
  expect(option('LP1').querySelector('[data-marker="assigned"]')).toBeNull();
  expect(option('LP1').getAttribute('aria-label')).not.toContain('선택한 component');
});

it('UX-2 blocks background selection and focus while the palette assigns its original alias', () => {
  mount();
  const other = option('LLA');
  const aliases = list();
  fireEvent.click(option('PM9'));
  press(aliases, 'a');
  const filter = screen.getByRole('combobox');
  fireEvent.click(other);
  expect(other.getAttribute('aria-selected')).toBe('false');
  aliases.focus();
  expect(document.activeElement).toBe(filter);
  fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
  expect(document.activeElement).toBe(filter);
  choose('pm-b');
  expect(option('PM9').textContent).toContain('pm-b');
  expect(option('LLA').textContent).toContain('ll-a');
  expect(document.activeElement).toBe(list());
});

it.each(['success', 'error'] as const)('UX-3 focuses the persistent save status during and after %s', async (outcome) => {
  let finish!: (result: SaveOutcome) => void;
  mount(() => new Promise<SaveOutcome>((resolve) => { finish = resolve; }));
  fireEvent.click(option('PM9'));
  press(list(), 'i');
  const save = button('저장');
  save.focus();
  fireEvent.click(save);
  const status = screen.getByRole('status');
  expect(document.activeElement).toBe(status);
  await act(async () => finish(outcome === 'success' ? { savedScopes: ['model'] } : { savedScopes: [], error: '실패' }));
  expect(document.activeElement).toBe(status);
  expect(status.textContent).toBe(outcome === 'success' ? '저장됨' : '저장 안 됨 · Model');
});

it('UX-4 marks only changed winning rules and names both dirty scopes, including after undo', () => {
  mount();
  fireEvent.click(option('PM9'));
  press(list(), 'i');
  expect(option('PM9').textContent).toContain('⊘ 무시 (미저장)');
  expect(option('LP1').textContent).not.toContain('(미저장)');
  expect(screen.getByRole('status').textContent).toBe('저장 안 됨 · Model');
  fireEvent.click(screen.getByRole('radio', { name: /^설비/ }));
  fireEvent.click(option('LP1'));
  press(list(), 'i');
  expect(option('LP1').textContent).toContain('⊘ 무시 (미저장)');
  expect(screen.getByRole('status').textContent).toBe('저장 안 됨 · Model, 설비');
  fireEvent.click(button('실행 취소'));
  expect(option('LP1').textContent).not.toContain('(미저장)');
  expect(screen.getByRole('status').textContent).toBe('저장 안 됨 · Model');
});

it.each(['model', 'equipment'] as const)('UX-5 explains saved Model replacements and missing targets at %s scope', (scope) => {
  const input = boardInput();
  input.ruleFiles.model = { ...input.ruleFiles.model!, rules: input.ruleFiles.model!.rules.map((rule) =>
    rule.id === 'lp' ? { ...rule, target: { componentId: 'missing-lp' } } : rule) };
  mount(undefined, input);
  fireEvent.click(option('LP1'));
  const pane = screen.getByRole('region', { name: '선택한 항목' });
  expect(pane.textContent).toContain('이 설비만 다르면 저장 범위를 설비로 바꾸세요');
  if (scope === 'equipment') fireEvent.click(screen.getByRole('radio', { name: /^설비/ }));
  press(list(), 'a');
  choose('lp-a');
  const warning = 'Model 규칙 lp을(를) 바꿉니다: synth-maker/synth-model의 모든 설비에 적용됩니다';
  expect(pane.textContent?.includes(warning)).toBe(scope === 'model');
  fireEvent.click(button('실행 취소'));
  expect(pane.textContent).not.toContain(warning);
});

it('UX-7 shows missing targets explicitly and differing component labels in the list and pane', () => {
  const input = boardInput();
  input.layout = { ...input.layout, components: input.layout.components.map((c) => c.id === 'pm-a' ? { ...c, label: 'PM Chamber A' } : c) };
  input.ruleFiles.model = { ...input.ruleFiles.model!, rules: input.ruleFiles.model!.rules.map((rule) =>
    rule.id === 'lp' ? { ...rule, target: { componentId: 'missing-lp' } } : rule) };
  mount(undefined, input);
  for (const [alias, text] of [['LP1', 'missing-lp (레이아웃에 없음)'], ['PM1', 'pm-a · PM Chamber A']]) {
    fireEvent.click(option(alias!));
    expect(option(alias!).textContent).toContain(text);
    expect(screen.getByRole('region', { name: '선택한 항목' }).textContent).toContain(text);
  }
});

it.each([
  ['PM9', '배정된 대상이 없어 확정할 수 없습니다'],
  ['LP1', '저장 범위에 이미 verified 정확 규칙이 있습니다'],
  ['PM2', '저장 범위에 이미 같은 verified 정확 규칙이 있습니다'],
])('UX-8 explains a no-op confirmation for %s in the pane and keyboard status', (alias, reason) => {
  mount();
  fireEvent.click(option(alias));
  expect(button('확정 (Enter)').getAttribute('aria-disabled')).toBe('true');
  expect(screen.getByRole('region', { name: '선택한 항목' }).textContent).toContain(reason);
  press(list(), 'Enter');
  expect(screen.getByRole('status').textContent).toBe(reason);
  expect(button('실행 취소').disabled).toBe(true);
});

it('UX-9 distinguishes a fresh clean board from a successful save and from undoing back to clean', async () => {
  mount();
  expect(screen.getByRole('status').textContent).toBe('변경 없음');
  fireEvent.click(option('PM9'));
  press(list(), 'i');
  fireEvent.click(button('저장'));
  await act(async () => {});
  expect(screen.getByRole('status').textContent).toBe('저장됨');
  press(list(), 'i');
  // Assigning a different target creates an edit; undo restores the saved baseline.
  press(list(), 'a');
  choose('pm-b');
  fireEvent.click(button('실행 취소'));
  expect(screen.getByRole('status').textContent).toBe('변경 없음');
});

it('UX-9 describes drafts without reporting human edits or triggering a leave guard', () => {
  const onDirtyChange = vi.fn();
  mount(undefined, { ruleFiles: {}, layout: templateDraft(), onDirtyChange });
  expect(screen.getByRole('status').textContent).toBe('초안 6건 (저장하면 assumed 규칙으로 기록)');
  expect(onDirtyChange).not.toHaveBeenCalledWith(true);
});

it('UX-12 labels draft rule ids as future rules and shows the supported keyboard legend', () => {
  mount(undefined, { ruleFiles: {}, layout: templateDraft() });
  fireEvent.click(option('LP1'));
  const pane = screen.getByRole('region', { name: '선택한 항목' });
  expect(pane.textContent).toContain('초안 (저장 시 board-lp1)');
  expect(within(pane).getByText('확실성')).toBeTruthy();
  expect(screen.getByRole('group', { name: '키보드 단축키' }).textContent).toBe('j/k 이동 · Shift 선택 확장 · Space 선택 · Enter 확정 · A 배정 · I 무시 · R 규칙화 · / 검색 · ⌘Z/⇧⌘Z');
});

it('UX-12 explains a missing target without appending the raw English diagnostic', () => {
  const input = boardInput();
  input.ruleFiles.model = { ...input.ruleFiles.model!, rules: input.ruleFiles.model!.rules.map((rule) =>
    rule.id === 'lp' ? { ...rule, target: { componentId: 'missing-lp' } } : rule) };
  mount(undefined, input);
  fireEvent.click(option('LP1'));
  const pane = screen.getByRole('region', { name: '선택한 항목' });
  expect(pane.textContent).toContain('규칙의 대상이 레이아웃에 없습니다');
  expect(pane.textContent).not.toContain('Unknown component');
});

it('UX-4 clears saved winning markers per scope after a partial save', async () => {
  mount(async () => ({ savedScopes: ['equipment'], error: 'Model 실패' }));
  fireEvent.click(option('PM9'));
  press(list(), 'i');
  fireEvent.click(screen.getByRole('radio', { name: /^설비/ }));
  fireEvent.click(option('LP1'));
  press(list(), 'i');
  fireEvent.click(button('저장'));
  await act(async () => {});
  expect(option('PM9').textContent).toContain('(미저장)');
  expect(option('LP1').textContent).not.toContain('(미저장)');
});

it.each(['pattern', 'shared exact'] as const)('UX-5 warns when a pending exact rule replaces a saved Model %s rule', (kind) => {
  const input = boardInput();
  if (kind === 'shared exact') {
    input.ruleFiles.model = { ...input.ruleFiles.model!, rules: input.ruleFiles.model!.rules.map((rule) =>
      rule.id === 'lp' ? { ...rule, match: { exact: ['LP1', 'OTHER_LP'] } } : rule) };
  }
  mount(undefined, input);
  fireEvent.click(option(kind === 'pattern' ? 'PM1' : 'LP1'));
  press(list(), 'a');
  choose(kind === 'pattern' ? 'pm-b' : 'lp-a');
  const id = kind === 'pattern' ? 'pm-pattern' : 'lp';
  expect(screen.getByRole('region', { name: '선택한 항목' }).textContent)
    .toContain(`Model 규칙 ${id}을(를) 바꿉니다: synth-maker/synth-model의 모든 설비에 적용됩니다`);
});

const markedAliases = () => Array.from(list().querySelectorAll('[aria-selected="true"]')).map((node) => node.getAttribute('aria-label')?.split(',')[0]);
const equipmentScope = () => fireEvent.click(screen.getByRole('radio', { name: /설비/ }));

it('confirms two marked rows with the keyboard at Equipment scope and undoes them together', () => {
  mount();
  equipmentScope();
  list().focus();
  press(list(), 'j');
  press(list(), 'j');
  press(list(), ' ');
  press(list(), 'j', { shiftKey: true });
  expect(markedAliases()).toEqual(['LLA', 'LP1']);
  expect(screen.getByText('2개 선택')).toBeTruthy();
  press(list(), 'Enter');
  expect(screen.getByRole('status').textContent).toBe('2건 확정 · 결과가 바뀌지 않음: LLA, LP1');
  expect(option('LLA').textContent).toContain('미저장');
  press(list(), 'z', { ctrlKey: true });
  expect(option('LLA').textContent).not.toContain('미저장');
  expect(option('LP1').textContent).not.toContain('미저장');
  expect(button('실행 취소').disabled).toBe(true);
});

it('marks with modifier clicks, clears with a plain click, and keeps aria-selected on the active row without marks', () => {
  mount();
  fireEvent.click(option('LLA'));
  expect(markedAliases()).toEqual(['LLA']);
  fireEvent.click(option('PM1'), { ctrlKey: true });
  fireEvent.click(option('PM9'), { shiftKey: true });
  expect(markedAliases()).toEqual(['LLA', 'PM1', 'PM2', 'PM9']);
  fireEvent.click(option('LP1'), { metaKey: true });
  expect(markedAliases()).toEqual(['LLA', 'LP1', 'PM1', 'PM2', 'PM9']);
  fireEvent.click(option('TM_R1'));
  expect(markedAliases()).toEqual(['TM_R1']);
});

it('bulk-ignores the marked rows and reports skips', () => {
  mount();
  list().focus();
  press(list(), 'j');
  press(list(), 'j', { shiftKey: true });
  press(list(), 'Escape');
  expect(markedAliases()).toEqual(['LLA']);
  press(list(), 'j', { shiftKey: true });
  fireEvent.click(button('일괄 무시 (I)'));
  expect(screen.getByRole('status').textContent).toBe('2건 무시');
});

it('confirms the assumed rows at once with 자동 일괄 확정', () => {
  mount();
  expect(button('자동 일괄 확정 (1)').disabled).toBe(false);
  cleanup();
  mount(undefined, { ruleFiles: {}, layout: templateDraft() });
  fireEvent.click(button('자동 일괄 확정 (6)'));
  expect(screen.getByRole('status').textContent).toBe('6건 확정');
  expect(button('자동 일괄 확정 (0)').disabled).toBe(true);
  fireEvent.click(button('실행 취소'));
  expect(button('자동 일괄 확정 (6)').disabled).toBe(false);
});

it('filters with / search, prunes marks of hidden rows and returns to the list on Esc', () => {
  mount();
  list().focus();
  press(list(), 'j');
  press(list(), ' ');
  press(list(), 'j', { shiftKey: true });
  press(list(), '/');
  const search = screen.getByRole('searchbox', { name: 'Alias 검색' });
  expect(document.activeElement).toBe(search);
  fireEvent.change(search, { target: { value: 'pm' } });
  expect(within(list()).getAllByRole('option').map((node) => node.id.split('alias-')[1])).toEqual(['PM1', 'PM2', 'PM9']);
  expect(within(list()).queryByRole('group', { name: 'Role lp' })).toBeNull();
  expect(markedAliases()).toEqual([]);
  fireEvent.change(search, { target: { value: 'zzz' } });
  expect(screen.getByText('일치하는 alias가 없습니다')).toBeTruthy();
  press(search, 'Escape');
  expect((search as HTMLInputElement).value).toBe('');
  expect(document.activeElement).toBe(list());
  expect(within(list()).getAllByRole('option')).toHaveLength(8);
});

it('previews a rule with R, refuses an overlap at Model scope and adds it at Equipment scope', () => {
  mount();
  list().focus();
  fireEvent.click(option('PM1'));
  press(list(), 'r');
  let dialog = screen.getByRole('dialog');
  expect(dialog.textContent).toContain('PM1에서 규칙 만들기 · 저장 범위 Model');
  expect((within(dialog).getByLabelText(/패턴/) as HTMLInputElement).value).toBe('PM{n}');
  expect((within(dialog).getByLabelText(/대상 component/) as HTMLInputElement).value).toBe('pm-{n:letter}');
  expect(document.activeElement).toBe(within(dialog).getByLabelText(/패턴/));
  expect(dialog.textContent).toContain('충돌 (pm-pattern');
  const add = within(dialog).getByRole('button', { name: '규칙 추가' });
  expect(add.getAttribute('aria-disabled')).toBe('true');
  expect(document.getElementById(add.getAttribute('aria-describedby')!)!.textContent).toBe('같은 범위 규칙과 겹칩니다: pm-pattern');
  fireEvent.click(add);
  expect(screen.getByRole('dialog')).toBeTruthy();
  press(dialog, 'Escape');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(list());
  equipmentScope();
  list().focus();
  press(list(), 'r');
  dialog = screen.getByRole('dialog');
  expect(dialog.textContent).toContain('매칭 3 · 적용 1 · 예외 1 · 대상 없음 1 · 충돌 0');
  expect(dialog.textContent).toContain('PM2 → pm-b · 예외 (정확 규칙 pm-two-assumed)');
  expect(dialog.textContent).toContain('PM9 → pm-i · 대상 없음 (레이아웃에 없음)');
  const footerClose = within(dialog).getByRole('button', { name: '닫기' });
  const iconClose = within(dialog).getByRole('button', { name: '창 닫기' });
  expect(footerClose.compareDocumentPosition(iconClose) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  iconClose.focus();
  press(iconClose, 'Tab');
  expect(document.activeElement).toBe(within(dialog).getByLabelText(/패턴/));
  press(within(dialog).getByLabelText(/패턴/), 'Enter');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(list());
  fireEvent.click(option('PM1'));
  expect(screen.getByRole('region', { name: '선택한 항목' }).textContent).toContain('설비 · pattern-pm-n · 패턴');
  fireEvent.click(button('실행 취소'));
  expect(screen.getByRole('region', { name: '선택한 항목' }).textContent).toContain('Model · pm-pattern');
});

it('offers an empty rule dialog when the alias has no digits', () => {
  mount();
  fireEvent.click(option('VIRT_SCH'));
  fireEvent.click(button('규칙화 (R)'));
  const dialog = screen.getByRole('dialog');
  expect(dialog.textContent).toContain('패턴을 제안할 숫자가 없습니다');
  expect((within(dialog).getByLabelText(/패턴/) as HTMLInputElement).value).toBe('');
});

it.each(['ctrlKey', 'metaKey'] as const)('preserves the implicit active selection on the first %s click', (modifier) => {
  mount();
  equipmentScope();
  fireEvent.click(option('LLA'));
  fireEvent.click(option('LP1'), { [modifier]: true });
  expect(markedAliases()).toEqual(['LLA', 'LP1']);
  press(list(), 'Enter');
  expect(screen.getByRole('status').textContent).toBe('2건 확정 · 결과가 바뀌지 않음: LLA, LP1');
  fireEvent.click(option('LLA'));
  fireEvent.click(option('LLA'), { [modifier]: true });
  expect(option('LLA').getAttribute('aria-label')).toContain('일괄 선택됨');
  expect(markedAliases()).toEqual(['LLA']);
});

it('drops marks when reassignment hides a row under a target filter', () => {
  mount();
  equipmentScope();
  const search = screen.getByRole('searchbox', { name: 'Alias 검색' });
  fireEvent.change(search, { target: { value: 'pm-a' } });
  fireEvent.click(option('PM1'));
  press(list(), ' ');
  press(list(), 'a');
  choose('pm-b');
  expect(within(list()).queryByRole('option')).toBeNull();
  fireEvent.change(search, { target: { value: 'pm' } });
  press(list(), 'j');
  press(list(), ' ');
  expect(markedAliases()).toEqual(['PM2']);
  press(list(), 'i');
  expect(option('PM2').textContent).toContain('⊘ 무시');
  expect(option('PM1').textContent).toContain('pm-b');
  expect(option('PM1').textContent).not.toContain('⊘ 무시');
});

it('keeps aggregated Model and override warnings and qualifies bulk ignore results', () => {
  mount();
  fireEvent.click(option('PM1'));
  press(list(), ' ');
  press(list(), 'j', { shiftKey: true });
  const pane = screen.getByRole('region', { name: '선택한 항목' });
  expect(pane.textContent).toContain('설비 범위 규칙이 우선하는 alias: PM2 (pm-two-assumed) — 확정·무시하려면 저장 범위를 설비로 바꾸세요');
  press(list(), 'i');
  expect(screen.getByRole('status').textContent).toBe('2건 무시 · 결과가 바뀌지 않음: PM2 (설비 규칙 pm-two-assumed 우선)');
  expect(pane.textContent).toContain('Model 규칙을 바꿉니다: pm-pattern, pm-two — synth-maker/synth-model의 모든 설비에 적용됩니다');
  expect(option('PM1').textContent).toContain('⊘ 무시');
  expect(option('PM2').textContent).toContain('◐ 자동');
  fireEvent.click(button('실행 취소'));
  expect(pane.textContent).not.toContain('Model 규칙을 바꿉니다:');
});


it('keeps a separate active caret while ignored rows remain marked', () => {
  mount();
  equipmentScope();
  fireEvent.click(option('LLA'));
  press(list(), ' ');
  press(list(), 'j', { shiftKey: true });
  press(list(), 'i');
  const caretRows = () => Array.from(list().querySelectorAll('[role="option"]'))
    .filter((row) => row.querySelector('[data-marker="active"]')).map((row) => row.id);
  expect(caretRows()).toEqual([option('LP1').id]);
  press(list(), 'k');
  expect(caretRows()).toEqual([option('LLA').id]);
  expect(markedAliases()).toEqual(['LLA', 'LP1']);
  expect(list().getAttribute('aria-activedescendant')).toBe(option('LLA').id);
});

it('shows a narrower-scope conflict in the rule preview without disabling add', () => {
  const base = boardInput();
  mount(undefined, { ruleFiles: {
    ...base.ruleFiles,
    model: { ...base.ruleFiles.model!, rules: [] },
    equipment: { ...base.ruleFiles.equipment!, rules: ['eq-a', 'eq-b'].map((id) => ({
      id, match: { pattern: 'PM{n}' }, target: { componentId: 'pm-a' }, certainty: 'verified' as const,
    })) },
  } });
  fireEvent.click(option('PM1'));
  press(list(), 'r');
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/대상 component/), { target: { value: 'pm-{n:letter}' } });
  expect(dialog.textContent).toContain('PM1 → pm-a · 충돌 (더 좁은 범위: eq-a, eq-b)');
  expect(within(dialog).getByRole('button', { name: '규칙 추가' }).getAttribute('aria-disabled')).toBe('false');
});


it('describes auto-confirm sharing and overrides before one-click confirmation', () => {
  mount();
  const auto = button('자동 일괄 확정 (1)');
  const description = () => document.getElementById(auto.getAttribute('aria-describedby') ?? '')?.textContent;
  expect(description()).toContain('Model 범위에 저장: synth-maker/synth-model의 모든 설비에 적용됩니다');
  expect(description()).toContain('설비 범위 규칙이 우선하는 alias: PM2 (pm-two-assumed)');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Alias 검색' }), { target: { value: 'LLA' } });
  expect(description()).not.toContain('PM2');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Alias 검색' }), { target: { value: '' } });
  fireEvent.click(auto);
  expect(screen.getByRole('status').textContent).toBe('0건 확정, 1건 건너뜀 (이미 확정됨)');
  equipmentScope();
  expect(description()).not.toContain('Model 범위에 저장');
  expect(description()).not.toContain('설비 범위 규칙이 우선');
  fireEvent.click(auto);
  expect(option('PM2').textContent).toContain('● 확정');
  expect(screen.getByRole('status').textContent).toBe('1건 확정');
});


it('keeps the active row apart from the bulk-marked rows', () => {
  mount();
  const caretRows = () => Array.from(list().querySelectorAll('[role="option"]'))
    .filter((row) => row.querySelector('[data-marker="active"]')).map((row) => row.id);
  fireEvent.click(option('LLA'));
  const expectState = (active: string, selected: string[]) => {
    expect(caretRows()).toEqual([option(active).id]);
    expect(list().getAttribute('aria-activedescendant')).toBe(option(active).id);
    expect(Array.from(list().querySelectorAll('[aria-selected="true"]')).map((row) => row.id)).toEqual(selected.map((alias) => option(alias).id));
  };
  expectState('LLA', ['LLA']);
  press(list(), ' ');
  expectState('LLA', ['LLA']);
  press(list(), 'j', { shiftKey: true });
  expectState('LP1', ['LLA', 'LP1']);
});
