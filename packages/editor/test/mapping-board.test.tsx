// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { validateAliasRules } from '@eqv/core';
import { MappingBoard, type MappingBoardProps, type SaveOutcome } from '../src/index.js';
import { boardInput, equipmentRules } from './board-data.js';

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
});

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
  expect(option('PM1').textContent).toContain('◆');
  expect(option('PM2').getAttribute('aria-label')).not.toMatch(/선택한 component/);
  expect(component(container, 'pm-a').getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(option('PM2'));
  expect(component(container, 'pm-b').getAttribute('aria-pressed')).toBe('true');
  expect(component(container, 'pm-a').getAttribute('aria-pressed')).toBe('false');
  expect(option('PM2').textContent).toContain('◆');
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
  close.focus();
  press(close, 'Tab');
  expect(document.activeElement).toBe(filter);
  press(filter, 'Tab', { shiftKey: true });
  expect(document.activeElement).toBe(close);
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
