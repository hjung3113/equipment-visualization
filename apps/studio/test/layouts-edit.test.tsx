// @vitest-environment jsdom
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { layoutDocumentSchema, layoutRevision } from '@eqv/core';
import { App } from '../src/App.js';
import { createFileApi } from '../server/files.js';
import { seedRoot } from './seed.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TEMPLATE = 'templates/cluster-single.template.json';
const DRAFT = 'layouts/cluster-single/draft.layout.json';
/** Parentless, rotated 90°, at x 331.4: a drag of 30 px is 45 layout units in the 640 px test viewer. */
const PM = 'pm-a';

let base: string;
let root: string;
beforeEach(async () => {
  ({ base, root } = await seedRoot());
  const api = createFileApi({ root });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const result = await api.handle({ method: init?.method ?? 'GET', url: input, headers, body: String(init?.body ?? '') });
    return new Response(JSON.stringify(result.body), { status: result.status });
  });
});
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await rm(base, { recursive: true, force: true });
});

const viewerSvg = (container: HTMLElement) => container.querySelector('[data-component-id]')!.closest('svg')!;
const componentEl = (container: HTMLElement, id: string) => container.querySelector(`[data-component-id="${id}"]`)!;
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const original = async (): Promise<Raw & Record<string, unknown>> => JSON.parse(await readFile(join(root, TEMPLATE), 'utf8'));
const readDraft = async (): Promise<Raw & Record<string, unknown>> => JSON.parse(await readFile(join(root, DRAFT), 'utf8'));

async function openTemplate() {
  window.history.replaceState(null, '', `/layouts?${new URLSearchParams({ file: TEMPLATE })}`);
  const view = render(<App />);
  await waitFor(() => expect(view.container.querySelector('[data-component-id]')).toBeTruthy());
  return view;
}

function pointer(target: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number) {
  const init = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1 };
  const Event_ = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
  act(() => { target.dispatchEvent(new Event_(type, init)); });
}

/** Drags a Component by (dx, dy) screen pixels; the pointer events end on the viewer svg, as the renderer tests do. */
function drag(container: HTMLElement, id: string, dx: number, dy = 0) {
  const svg = viewerSvg(container);
  pointer(componentEl(container, id), 'pointerdown', 100, 100);
  pointer(svg, 'pointermove', 100 + dx, 100 + dy);
  pointer(svg, 'pointerup', 100 + dx, 100 + dy);
}

/** Selects a Component and puts the key target on the viewer. */
function select(container: HTMLElement, id: string) {
  fireEvent.click(componentEl(container, id));
  expect(componentEl(container, id).getAttribute('aria-pressed')).toBe('true');
}

const saveDraft = async () => {
  fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
  await waitFor(() => expect(window.location.search).toContain('draft.layout.json'));
  await waitFor(() => expect(screen.queryByText('저장 안 됨')).toBeNull());
};

type Raw = { components: { id: string; transform: Record<string, number>; provenance: Record<string, unknown> }[] };

/** The layout with every Component transform and transform provenance removed: what an edit must not touch. */
function withoutTransforms(layout: Raw) {
  const components = structuredClone(layout.components);
  for (const component of components) {
    delete (component as { transform?: unknown }).transform;
    delete component.provenance.transform;
  }
  return { ...layout, components };
}

it('moves a dragged Component, marks the document unsaved and saves only that transform', async () => {
  const { container } = await openTemplate();
  const before = await original();
  drag(container, PM, 30);
  await waitFor(() => expect(field('X').value).toBe('376.4'));
  expect(field('Y').value).toBe(String(before.components.find((c) => c.id === PM)!.transform.y));
  expect(screen.getByText('저장 안 됨')).toBeTruthy();

  await saveDraft();
  const saved = await readDraft();
  expect(withoutTransforms(saved)).toEqual(withoutTransforms(before));
  const transforms = (layout: Raw) => layout.components.map((c) => [c.id, c.transform]);
  const expected = before.components.map((c) => [c.id, c.id === PM ? { ...c.transform, x: 376.4 } : c.transform]);
  expect(transforms(saved)).toEqual(expected);
});

it('snaps a drag to the grid when 격자 맞춤 is on', async () => {
  const { container } = await openTemplate();
  fireEvent.click(screen.getByLabelText('격자 맞춤'));
  drag(container, PM, 30, 20);
  await waitFor(() => expect(Number(field('X').value) % 10).toBe(0));
  expect(Number(field('Y').value) % 10).toBe(0);
  expect(field('X').value).toBe('380');
});

it.each([
  { name: 'Alt+ArrowRight', event: { key: 'ArrowRight', altKey: true }, expected: { X: '332.4' } },
  { name: 'Shift+Alt+ArrowDown', event: { key: 'ArrowDown', altKey: true, shiftKey: true }, expected: { Y: '246' } },
  { name: '[', event: { key: '[' }, expected: { '회전 (°)': '75' } },
  { name: ']', event: { key: ']' }, expected: { '회전 (°)': '105' } },
])('$name on the viewer changes the selected Component', async ({ event, expected }) => {
  const { container } = await openTemplate();
  select(container, PM);
  fireEvent.keyDown(viewerSvg(container), event);
  for (const [label, value] of Object.entries(expected)) expect(field(label).value).toBe(value);
  expect(screen.getByText('저장 안 됨')).toBeTruthy();
});

it('snaps keyboard moves and rotations when 격자 맞춤 is on', async () => {
  const { container } = await openTemplate();
  fireEvent.click(screen.getByLabelText('격자 맞춤'));
  select(container, PM);
  fireEvent.keyDown(viewerSvg(container), { key: 'ArrowRight', altKey: true });
  expect(field('X').value).toBe('340');
  fireEvent.keyDown(viewerSvg(container), { key: ']' });
  expect(field('회전 (°)').value).toBe('105');
});

it('ignores edit keys without a selection', async () => {
  const { container } = await openTemplate();
  fireEvent.keyDown(viewerSvg(container), { key: 'ArrowRight', altKey: true });
  fireEvent.keyDown(viewerSvg(container), { key: ']' });
  expect(screen.queryByText('저장 안 됨')).toBeNull();
  expect((screen.getByRole('button', { name: '실행 취소' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('Top View에서 Component를 선택하세요.')).toBeTruthy();
});

it('commits a typed value on Enter, rejects a non-number and restores on Escape', async () => {
  const { container } = await openTemplate();
  select(container, PM);
  const x = field('X');
  fireEvent.change(x, { target: { value: '300' } });
  fireEvent.keyDown(x, { key: 'Enter' });
  expect(field('X').value).toBe('300');
  expect(screen.getByText('저장 안 됨')).toBeTruthy();

  fireEvent.change(x, { target: { value: 'abc' } });
  fireEvent.keyDown(x, { key: 'Enter' });
  expect(screen.getByText('숫자를 입력하세요')).toBeTruthy();
  fireEvent.keyDown(x, { key: 'Escape' });
  expect(field('X').value).toBe('300');
  expect(screen.queryByText('숫자를 입력하세요')).toBeNull();

  fireEvent.change(x, { target: { value: '' } });
  fireEvent.blur(x);
  expect(screen.getByText('숫자를 입력하세요')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '실행 취소' }));
  expect(field('X').value).toBe('331.4');
});

it('undoes and redoes a drag as one step, by button and by key, but not while a field has focus', async () => {
  const { container } = await openTemplate();
  const undo = () => screen.getByRole('button', { name: '실행 취소' }) as HTMLButtonElement;
  const redo = () => screen.getByRole('button', { name: '다시 실행' }) as HTMLButtonElement;
  expect(undo().disabled).toBe(true);
  drag(container, PM, 30);
  await waitFor(() => expect(field('X').value).toBe('376.4'));

  fireEvent.click(undo());
  expect(field('X').value).toBe('331.4');
  expect(screen.queryByText('저장 안 됨')).toBeNull();
  fireEvent.click(redo());
  expect(field('X').value).toBe('376.4');

  fireEvent.keyDown(viewerSvg(container), { key: 'z', metaKey: true });
  expect(field('X').value).toBe('331.4');
  fireEvent.keyDown(viewerSvg(container), { key: 'z', metaKey: true, shiftKey: true });
  expect(field('X').value).toBe('376.4');

  fireEvent.keyDown(field('Y'), { key: 'z', ctrlKey: true });
  expect(field('X').value).toBe('376.4');
});

it('asks before leaving unsaved edits and not after saving them', async () => {
  const { container } = await openTemplate();
  await screen.findByRole('link', { name: 'cluster-single' });
  drag(container, PM, 30);
  await screen.findByText('저장 안 됨');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  try {
    const originalUrl = window.location.href;
    fireEvent.click(screen.getByRole('link', { name: 'cluster-single' }));
    expect(confirm).toHaveBeenCalledWith('저장하지 않은 편집이 있습니다. 버리고 이동할까요?');
    expect(window.location.href).toBe(originalUrl);
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    confirm.mockClear();
    await saveDraft();
    fireEvent.click(await screen.findByRole('link', { name: 'cluster-single' }));
    expect(confirm).not.toHaveBeenCalled();
    const saved = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false);
  } finally {
    confirm.mockRestore();
  }
});

it('keeps the import text when an import is unsaved on top of edits', async () => {
  const { container } = await openTemplate();
  drag(container, PM, 30);
  await screen.findByText('저장 안 됨');
  const raw = await original();
  raw.id = 'unsaved-import';
  fireEvent.change(screen.getByLabelText(/가져오기/), { target: { files: [{ text: async () => JSON.stringify(raw) }] } });
  await screen.findByText('unsaved-import');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  try {
    fireEvent.click(await screen.findByRole('link', { name: 'cluster-single' }));
    expect(confirm).toHaveBeenCalledWith('저장하지 않은 가져오기 문서가 있습니다. 버리고 이동할까요?');
  } finally {
    confirm.mockRestore();
  }
});

it('lists only the moved Component as changed in the publish dialog', async () => {
  const raw = await original();
  const hex = (await layoutRevision(layoutDocumentSchema.parse(raw))).slice('sha256:'.length);
  await mkdir(join(root, 'layouts/cluster-single'), { recursive: true });
  await writeFile(join(root, `layouts/cluster-single/${hex}.layout.json`), JSON.stringify(raw));
  const { container } = await openTemplate();
  drag(container, PM, 30);
  await screen.findByText('저장 안 됨');
  fireEvent.click(screen.getByRole('button', { name: 'Revision 게시' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(await within(dialog).findByText('추가 0 · 삭제 0 · 변경 1')).toBeTruthy();
  const table = within(dialog).getByRole('table', { name: 'Layout 변경 목록' });
  expect(within(table).getAllByRole('row')).toHaveLength(2);
  expect(within(table).getByText(PM)).toBeTruthy();
});

it('adds no connectivity when a Component is dropped onto another', async () => {
  const { container } = await openTemplate();
  const before = await original();
  // lp-1 sits 110 units left of lp-2: 74 px is 111 units, so it lands on top of it.
  drag(container, 'lp-1', 74);
  await screen.findByText('저장 안 됨');
  await saveDraft();
  const saved = await readDraft();
  for (const graph of ['physicalInterfaces', 'transferCapabilities', 'processRoutes'] as const) expect(saved[graph]).toEqual(before[graph]);
  expect(saved.unit).toBe(before.unit);
  expect(saved.viewBox).toEqual(before.viewBox);
});

it('keeps history, selection and the saved baseline when a template edit is saved to its draft', async () => {
  const { container } = await openTemplate();
  select(container, PM);
  drag(container, PM, 30);
  await waitFor(() => expect(field('X').value).toBe('376.4'));
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  try {
    await saveDraft();
    expect(componentEl(container, PM).getAttribute('aria-pressed')).toBe('true');
    expect(field('X').value).toBe('376.4');
    const undo = screen.getByRole('button', { name: '실행 취소' }) as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    fireEvent.click(undo);
    expect(field('X').value).toBe('331.4');
    expect(confirm).not.toHaveBeenCalled();
  } finally {
    confirm.mockRestore();
  }
});

it('settles a drag that is still held when the publish dialog opens', async () => {
  const { container } = await openTemplate();
  select(container, PM);
  pointer(componentEl(container, PM), 'pointerdown', 100, 100);
  pointer(viewerSvg(container), 'pointermove', 130, 100);
  fireEvent.click(screen.getByRole('button', { name: 'Revision 게시' }));
  const dialog = await screen.findByRole('alertdialog');
  pointer(viewerSvg(container), 'pointerup', 130, 100);
  fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(field('X').value).toBe('331.4');
  fireEvent.keyDown(viewerSvg(container), { key: 'ArrowRight', altKey: true });
  expect(field('X').value).toBe('332.4');
});

/** Assembly tests use an equipment layout; template cardinality must remain protected. */
async function openAssembly(options: { parent?: boolean; baseline?: boolean } = {}) {
  const raw = await original() as Awaited<ReturnType<typeof original>> & { components: (Raw['components'][number] & { levelId: string; label: string; parentId?: string })[] };
  delete raw.roleCardinality;
  raw.kind = 'equipment-layout';
  raw.templateId = 'cluster-single';
  if (options.parent) (raw.components.find((c) => c.id === PM)! as Raw['components'][number] & { parentId: string }).parentId = 'tm-1';
  await mkdir(join(root, 'layouts/cluster-single'), { recursive: true });
  await writeFile(join(root, DRAFT), JSON.stringify(raw));
  if (options.baseline) {
    const hex = (await layoutRevision(layoutDocumentSchema.parse(raw))).slice('sha256:'.length);
    await writeFile(join(root, `layouts/cluster-single/${hex}.layout.json`), JSON.stringify(raw));
  }
  window.history.replaceState(null, '', `/layouts?${new URLSearchParams({ file: DRAFT })}`);
  const view = render(<App />);
  await waitFor(() => expect(view.container.querySelector('[data-component-id]')).toBeTruthy());
  return { ...view, raw };
}

async function choosePrimitive(name: string) {
  // Radix scrolls the focused option; jsdom has no layout scrolling API.
  const originalScroll = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView ??= function scrollIntoViewStub() {};
  try {
    fireEvent.keyDown(screen.getByRole('combobox', { name: '추가할 Component 종류' }), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name }));
  } finally { Element.prototype.scrollIntoView = originalScroll; }
}

it('adds and selects a median-sized primitive, saving assumed provenance without connectivity', async () => {
  const { container, raw } = await openAssembly();
  await choosePrimitive('pm');
  fireEvent.click(screen.getByRole('button', { name: 'Component 추가' }));
  expect(componentEl(container, 'pm-1').getAttribute('aria-pressed')).toBe('true');
  expect(field('이름').value).toBe('PM 1');
  const viewBox = raw.viewBox as { x: number; y: number; width: number; height: number };
  expect(Number(field('X').value)).toBe(viewBox.x + viewBox.width / 2);
  expect(Number(field('Y').value)).toBe(viewBox.y + viewBox.height / 2);
  // Put it over an existing Component before saving: adjacency still creates no graph.
  for (const label of ['X', 'Y']) {
    fireEvent.change(field(label), { target: { value: String(raw.components.find((c) => c.id === PM)!.transform[label.toLowerCase()]) } });
    fireEvent.keyDown(field(label), { key: 'Enter' });
  }
  await saveDraft();
  const saved = await readDraft();
  const added = saved.components.find((c) => c.id === 'pm-1')!;
  expect(added).toMatchObject({ role: 'pm', assetRef: 'primitive:pm', label: 'PM 1', levelId: raw.components[0]!.levelId, ports: [], holdingSites: [] });
  // The fixture's 14 longer sides have 84 at both middle positions.
  const size = (added as typeof added & { size: { width: number; height: number } }).size;
  expect(Math.max(size.width, size.height)).toBe(84);
  expect(added.provenance).toEqual(Object.fromEntries(['role', 'assetRef', 'label', 'levelId', 'transform'].map((key) => [key, { certainty: 'assumed', sourceEvidence: [] }])));
  for (const graph of ['physicalInterfaces', 'transferCapabilities', 'processRoutes']) expect(saved[graph]).toEqual(raw[graph]);
});

it('protects template cardinality from add, delete and Delete keys', async () => {
  const { container } = await openTemplate();
  select(container, PM);
  expect((screen.getByRole('button', { name: 'Component 추가' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: '삭제' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('템플릿에는 Component를 추가하거나 삭제할 수 없습니다. 이 템플릿으로 시작한 레이아웃에서 편집하세요.')).toBeTruthy();
  fireEvent.keyDown(viewerSvg(container), { key: 'Delete' });
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

it('confirms counted graph removal by Delete, saves it, and restores both by undo without selection', async () => {
  const { container, raw } = await openAssembly();
  select(container, 'lp-1');
  fireEvent.keyDown(componentEl(container, 'lp-1'), { key: 'Delete' });
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText(/Physical Interface 1개/)).toBeTruthy();
  expect((screen.getByRole('button', { name: '초안 저장', hidden: true }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(document.activeElement).toBe(viewerSvg(container).closest('div[tabindex="-1"]')!.querySelector('button:not([disabled]), [tabindex="0"]'));
  await saveDraft();
  const saved = await readDraft();
  expect(saved.components.some((c) => c.id === 'lp-1')).toBe(false);
  expect((saved.physicalInterfaces as unknown[]).length).toBe((raw.physicalInterfaces as unknown[]).length - 1);
  fireEvent.click(screen.getByRole('button', { name: '실행 취소' }));
  expect(componentEl(container, 'lp-1')).toBeTruthy();
  expect(screen.getByText('Top View에서 Component를 선택하세요.')).toBeTruthy();
  await saveDraft();
  expect((await readDraft()).physicalInterfaces).toEqual(raw.physicalInterfaces);
});

it('cancels a held drag for deletion, freezes undo, and discards a stale dialog on file switch', async () => {
  const { container } = await openAssembly();
  select(container, PM);
  fireEvent.keyDown(viewerSvg(container), { key: 'ArrowRight', altKey: true });
  const x = field('X').value;
  pointer(componentEl(container, PM), 'pointerdown', 100, 100);
  pointer(viewerSvg(container), 'pointermove', 130, 100);
  fireEvent.click(screen.getByRole('button', { name: '삭제' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(field('X').value).toBe(x);
  fireEvent.keyDown(dialog, { key: 'z', metaKey: true });
  expect(field('X').value).toBe(x);
  fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '삭제' }));
  fireEvent.click(screen.getByRole('button', { name: '삭제' }));
  await screen.findByRole('alertdialog');
  const discard = vi.spyOn(window, 'confirm').mockReturnValue(true);
  try {
    fireEvent.click(await screen.findByRole('link', { name: 'cluster-single', hidden: true }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect((await readDraft()).components.some((c) => c.id === PM)).toBe(true);
  } finally { discard.mockRestore(); }
});

it('blocks deleting a parent and explains that its children must go first', async () => {
  const { container } = await openAssembly({ parent: true });
  select(container, 'tm-1');
  expect((screen.getByRole('button', { name: '삭제' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('하위 Component를 먼저 삭제하세요.')).toBeTruthy();
});

it('commits a trimmed label on Enter and rejects an empty label', async () => {
  const { container } = await openAssembly();
  select(container, PM);
  fireEvent.change(field('이름'), { target: { value: '  New chamber  ' } });
  fireEvent.keyDown(field('이름'), { key: 'Enter' });
  await saveDraft();
  expect((await readDraft()).components.find((c) => c.id === PM)).toMatchObject({ label: 'New chamber' });
  fireEvent.change(field('이름'), { target: { value: '' } });
  fireEvent.blur(field('이름'));
  expect(screen.getByText('이름을 입력하세요')).toBeTruthy();
});

it('previews an added Component in the publish dialog', async () => {
  await openAssembly({ baseline: true });
  await choosePrimitive('pm');
  fireEvent.click(screen.getByRole('button', { name: 'Component 추가' }));
  fireEvent.click(screen.getByRole('button', { name: 'Revision 게시' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(await within(dialog).findByText('추가 1 · 삭제 0 · 변경 0')).toBeTruthy();
  expect(within(within(dialog).getByRole('table', { name: 'Layout 변경 목록' })).getByText('pm-1')).toBeTruthy();
});
