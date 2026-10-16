// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { BindingsFile } from '@eqv/core';
import { DIRTY_REASON, planPublish, PublishPanel, type DryRun, type PublishPanelProps } from '../src/index.js';
import { boardInput, layoutWithoutLpLl } from './board-data.js';
import { bindings, dictionaries, inventory, mappings } from './data.js';

// The first dry-run call can be held back, to make a late result for older inputs.
const hold = vi.hoisted(() => ({ release: null as null | (() => void), next: null as null | Promise<void> }));
vi.mock('../src/publish.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/publish.js')>();
  return {
    ...original,
    dryRun: async (input: Parameters<typeof original.dryRun>[0]): Promise<DryRun> => {
      const gate = hold.next;
      hold.next = null;
      const result = await original.dryRun(input);
      if (gate) await gate;
      return result;
    },
  };
});

afterEach(() => { cleanup(); hold.next = null; });

const props = (change: Partial<PublishPanelProps> = {}): PublishPanelProps => {
  const { equipment, layout, ruleFiles } = boardInput();
  return {
    input: { equipment, inventory: inventory(), dictionaries, layout, ruleFiles },
    bindings: null, previous: null, boardDirty: false, publishing: false, receipt: null,
    onPublish: async () => ({ ok: true, mappingHash: 'sha256:' + 'c'.repeat(64) }),
    onHighlight: () => {}, onModelDryRun: async () => [], renderLink: (id) => <a href={`/onboarding/${id}`}>{id}</a>,
    ...change,
  };
};
const publishButton = () => screen.getByRole('button', { name: '게시' });
const from = () => screen.getByLabelText('effectiveFrom') as HTMLInputElement;
const ready = () => screen.findByRole('list', { name: '미매핑 alias' });
const withBinding: BindingsFile = bindings;

it('shows coverage, the unmapped list ordered by references, and the dry-run heading', async () => {
  render(<PublishPanel {...props()} />);
  await ready();
  expect(screen.getByRole('heading', { name: '⑤ 검증 (dry-run)' })).toBeTruthy();
  expect(screen.getByText(/^참조 \d+\/\d+ \(\d+%\) ·/).textContent).toMatch(/alias \d+\/\d+ \(\d+%\) · assumed \d+% · 무시 1$/);
  expect(within(screen.getByRole('list', { name: '미매핑 alias' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['PM9 · 영향도 1']);
});

it('toggles a conflict highlight with aria-pressed', async () => {
  const onHighlight = vi.fn();
  const { equipment, ruleFiles } = boardInput();
  render(<PublishPanel {...props({ onHighlight, input: { equipment, inventory: inventory(), dictionaries, layout: layoutWithoutLpLl(), ruleFiles } })} />);
  const conflict = await screen.findByRole('button', { name: /^이송 LP1 → LLA \(2건\)/ });
  expect(conflict.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(conflict);
  expect(conflict.getAttribute('aria-pressed')).toBe('true');
  expect(onHighlight).toHaveBeenLastCalledWith({
    componentIds: ['lp-a', 'll-a'],
    transfers: [{ from: 'lp-a', to: 'll-a', label: '관측 이송 LP1 → LLA 2건 (Transfer Capability 없음)' }],
  });
  fireEvent.click(conflict);
  expect(conflict.getAttribute('aria-pressed')).toBe('false');
  expect(onHighlight).toHaveBeenLastCalledWith(null);
});

it('disables 게시 with the unsaved-changes reason while the Board is dirty and does not publish', async () => {
  const onPublish = vi.fn(async () => ({ ok: true as const, mappingHash: 'sha256:' + 'c'.repeat(64) }));
  render(<PublishPanel {...props({ boardDirty: true, onPublish })} />);
  await ready();
  expect(publishButton().getAttribute('aria-disabled')).toBe('true');
  expect(publishButton().getAttribute('aria-describedby')).toBeTruthy();
  expect(document.getElementById(publishButton().getAttribute('aria-describedby')!)?.textContent?.trim()).toBe(DIRTY_REASON);
  fireEvent.click(publishButton());
  expect(onPublish).not.toHaveBeenCalled();
});

it.each([
  ['without bindings', null, '2026-01-01T10:00:00.000'],
  ['with bindings', withBinding, '2026-01-01T10:30:00.000'],
])('prefills effectiveFrom from the Inventory %s', async (_name, given, expected) => {
  render(<PublishPanel {...props({ bindings: given, previous: given ? Object.values(mappings).find(({ hash }) => hash === given.bindings.at(-1)!.mappingHash)! : null })} />);
  await ready();
  expect(from().value).toBe(expected);
});

it('publishes the computed plan and shows the receipt and the host failure', async () => {
  const onPublish = vi.fn(async () => ({ ok: false as const, error: 'bindings 저장 실패: 400' }));
  const { rerender } = render(<PublishPanel {...props({ onPublish })} />);
  await waitFor(() => expect(publishButton().getAttribute('aria-disabled')).toBe('false'));
  fireEvent.click(publishButton());
  await waitFor(() => expect(document.querySelector('.eqv-ed-publish-status')!.textContent).toBe('bindings 저장 실패: 400'));
  expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ problems: [], bindings: expect.objectContaining({ equipmentId: 'eq-synth-01' }) }));
  rerender(<PublishPanel {...props({ onPublish, publishing: true })} />);
  expect(document.querySelector('.eqv-ed-publish-status')!.textContent).toBe('게시 중…');
  rerender(<PublishPanel {...props({ onPublish, receipt: { mappingHash: 'sha256:' + 'ab'.repeat(32), effectiveFrom: '2026-01-01T10:30:00.000' } })} />);
  expect(document.querySelector('.eqv-ed-publish-status')!.textContent).toBe('게시됨 · abababababab · 2026-01-01T10:30:00.000');
});

it('ignores a dry-run result that arrives after the inputs changed', async () => {
  let release!: () => void;
  hold.next = new Promise<void>((resolve) => { release = resolve; });
  const first = props();
  const { rerender } = render(<PublishPanel {...first} />);
  const { equipment, ruleFiles } = boardInput();
  rerender(<PublishPanel {...props({ input: { equipment, inventory: inventory(), dictionaries, layout: layoutWithoutLpLl(), ruleFiles } })} />);
  await screen.findByRole('button', { name: /^이송 LP1 → LLA/ });
  release();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(screen.getByRole('button', { name: /^이송 LP1 → LLA/ })).toBeTruthy();
  expect(screen.queryByText('Mapping Conflict가 없습니다.')).toBeNull();
});

it('shows only the unchanged blocker after success and restores date validation when editing resumes', async () => {
  const initial = props();
  const accepted = await planPublish({ ...initial.input, bindings: null, previous: null, effectiveFrom: initial.input.inventory.from });
  expect(accepted.problems).toEqual([]);
  const receipt = { mappingHash: accepted.mapping!.hash, effectiveFrom: initial.input.inventory.from };
  const completed = { ...initial, bindings: accepted.bindings, previous: accepted.mapping, receipt };
  const { rerender } = render(<PublishPanel {...completed} />);
  // The host remounts after loading the accepted bindings.
  expect(from().value).toBe(receipt.effectiveFrom);
  const reason = () => document.getElementById(publishButton().getAttribute('aria-describedby')!)!.textContent!.trim();
  await waitFor(() => expect(reason()).toBe('이전 게시와 같습니다'));
  expect(from().getAttribute('aria-invalid')).toBe('false');
  expect(publishButton().getAttribute('aria-disabled')).toBe('true');
  expect(document.querySelector('.eqv-ed-publish-status')!.textContent).toBe('게시됨 · ' + receipt.mappingHash.slice(7, 19) + ' · ' + receipt.effectiveFrom);
  rerender(<PublishPanel {...completed} input={{ ...initial.input, layout: { ...initial.input.layout, name: 'Changed draft' } }} />);
  await waitFor(() => expect(from().getAttribute('aria-invalid')).toBe('true'));
  expect(reason()).toContain('effectiveFrom은 마지막 binding');
  rerender(<PublishPanel {...completed} />);
  await waitFor(() => expect(reason()).toBe('이전 게시와 같습니다'));
  fireEvent.change(from(), { target: { value: 'bad' } });
  await waitFor(() => expect(from().getAttribute('aria-invalid')).toBe('true'));
  expect(reason()).toContain('effectiveFrom 형식이 올바르지 않습니다');
  expect(publishButton().getAttribute('aria-disabled')).toBe('true');
});

it('lists same-Model rows with host links and row errors', async () => {
  const rows = [
    { equipmentId: 'eq-b', status: '미게시' as const, referenceRatio: null, aliasRatio: null, conflicts: null, unmappedReferences: null, blockingIssues: null, error: '레이아웃 초안 없음' },
    { equipmentId: 'eq-a', status: '게시됨' as const, referenceRatio: 0.5, aliasRatio: 0.25, conflicts: 2, unmappedReferences: 3, blockingIssues: 0, error: null },
  ];
  render(<PublishPanel {...props({ onModelDryRun: async () => rows })} />);
  fireEvent.click(screen.getByRole('button', { name: '같은 Model 일괄 dry-run 실행' }));
  const table = await screen.findByRole('table', { name: /synth-maker\/synth-model 설비 2대/ });
  expect(within(table).getByRole('link', { name: 'eq-a' }).getAttribute('href')).toBe('/onboarding/eq-a');
  expect(within(within(table).getByRole('link', { name: 'eq-b' }).closest('tr')!).getByText('레이아웃 초안 없음')).toBeTruthy();
});
