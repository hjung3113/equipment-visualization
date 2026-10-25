// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  bindingsFileSchema, layoutDocumentSchema, mappingVersionSchema, occurrenceBatchSchema, type ReplayInput,
} from '@eqv/core';
import { FocusView } from '../src/index.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
afterEach(cleanup);

const root = resolve(process.cwd(), '../../fixtures/cluster-single');
const read = (path: string): unknown => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const directory = 'onboarding/mappings/eq-synth-01/';
const layout = layoutDocumentSchema.parse(read('layout.json'));
if (layout.kind !== 'equipment-layout') throw new Error('Expected equipment layout');
const input: ReplayInput = {
  batch: occurrenceBatchSchema.parse(read('occurrence-batch.json')), layouts: [layout],
  bindings: bindingsFileSchema.parse(read('onboarding/bindings/eq-synth-01.bindings.json')),
  mappings: readdirSync(resolve(root, directory)).sort().map((file) => mappingVersionSchema.parse(read(directory + file))),
};
const OCCURRENCE = 'occ-pm1-process';
const row = () => document.querySelector(`tr[data-occurrence-id="${OCCURRENCE}"]`)!;
const shownAt = () => within(screen.getByRole('region', { name: '커서 시점 상태' })).getByText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{3})?$/).textContent;

it('renders the Top View, the Gantt and the Occurrence list from props', () => {
  render(<FocusView input={input} notices={['안내 한 줄']} entityType={null} anchor={null} resetKey="a" />);
  expect(screen.getByText('안내 한 줄').getAttribute('role')).toBe('status');
  screen.getByRole('heading', { name: 'Top View' });
  screen.getByRole('heading', { name: 'Gantt' });
  expect(row()).toBeTruthy();
  screen.getByRole('tab', { name: '근거 상세' });
});

type Detail = { node: ReactNode; label: string } | null;
/** A host that renders the detail slot it is handed; `attached` false removes the callback. */
function DetailHost({ resetKey = 'a', attached = true, actions }: { resetKey?: string; attached?: boolean; actions?: ReactNode }) {
  const [detail, setDetail] = useState<Detail>(null);
  return (
    <>
      <section aria-label="host-detail">{detail && <><h2>{detail.label}</h2>{detail.node}</>}</section>
      <FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey={resetKey}
        {...(attached ? { renderDetail: setDetail } : {})} {...(actions ? { links: { actions } } : {})} />
    </>
  );
}
const slot = () => screen.getByRole('region', { name: 'host-detail' });

it('renders the evidence detail in the host slot, drops the inline tab, and clears the slot on reset and unmount', () => {
  const view = render(<DetailHost />);
  expect(screen.queryByRole('tab', { name: '근거 상세' })).toBeNull();
  expect(slot().textContent).toBe('');
  fireEvent.click(row());
  expect(within(slot()).getByRole('heading', { name: `근거 상세 · ${OCCURRENCE}` })).toBeTruthy();
  expect(slot().textContent).toContain(OCCURRENCE);
  expect(slot().textContent!.length).toBeGreaterThan(`근거 상세 · ${OCCURRENCE}`.length);
  view.rerender(<DetailHost resetKey="b" />);
  expect(slot().textContent).toBe('');
});

it('publishes the current detail when a callback attaches and clears the old slot when it is removed', () => {
  const view = render(<DetailHost attached={false} />);
  fireEvent.click(row());
  view.rerender(<DetailHost />);
  expect(slot().textContent).toContain(OCCURRENCE);
  view.rerender(<DetailHost attached={false} />);
  expect(slot().textContent).toBe('');
});

it('clears the host detail through the callback on unmount and through the old callback on replacement', () => {
  const calls: Detail[] = [];
  const first = (detail: Detail) => { calls.push(detail); };
  const second = vi.fn();
  const view = render(<FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey="a" renderDetail={first} />);
  fireEvent.click(row());
  expect(calls.at(-1)?.label).toContain(OCCURRENCE);
  view.rerender(<FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey="a" renderDetail={second} />);
  expect(calls.at(-1)).toBeNull();
  expect(second.mock.lastCall![0].label).toContain(OCCURRENCE);
  view.unmount();
  expect(second.mock.lastCall![0]).toBeNull();
});

it('shows the Occurrence list when a controlled tab is "detail" but the host owns the detail slot', () => {
  render(<FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey="a" renderDetail={vi.fn()} tab="detail" onTabChange={vi.fn()} />);
  expect(screen.getByRole('tab', { name: 'Occurrence 목록' }).getAttribute('aria-selected')).toBe('true');
  expect(row()).toBeTruthy();
});

it('renders links.actions in the Top View action area', () => {
  render(<DetailHost actions={<button type="button">호스트 동작</button>} />);
  const panel = screen.getByRole('heading', { name: 'Top View' }).closest('section, div')!.parentElement!;
  expect(within(panel).getByRole('button', { name: '호스트 동작' })).toBeTruthy();
});

it('resets the cursor and selection when resetKey changes', () => {
  const view = render(<FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey="a" />);
  const initial = shownAt();
  fireEvent.click(row());
  expect(shownAt()).not.toBe(initial);
  expect(row().getAttribute('aria-selected')).toBe('true');
  view.rerender(<FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey="b" />);
  expect(shownAt()).toBe(initial);
  expect(document.querySelector('tr[aria-selected="true"]')).toBeNull();
});

it('Escape on a focused list row closes the host detail slot', () => {
  render(<DetailHost />);
  fireEvent.click(row());
  expect(slot().textContent).not.toBe('');
  fireEvent.keyDown(row(), { key: 'Escape' });
  expect(slot().textContent).toBe('');
});
