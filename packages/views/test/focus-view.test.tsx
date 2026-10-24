// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
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
const shownAt = () => within(screen.getByRole('region', { name: '커서 시점 상태' })).getByText(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/).textContent;

it('renders the Top View, the Gantt and the Occurrence list from props', () => {
  render(<FocusView input={input} notices={['안내 한 줄']} entityType={null} anchor={null} resetKey="a" />);
  expect(screen.getByText('안내 한 줄').getAttribute('role')).toBe('status');
  screen.getByRole('heading', { name: 'Top View' });
  screen.getByRole('heading', { name: 'Gantt' });
  expect(row()).toBeTruthy();
  screen.getByRole('tab', { name: '근거 상세' });
});

it('hands the evidence detail to the host and drops the inline tab when renderDetail is given', () => {
  const renderDetail = vi.fn();
  render(<FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey="a" renderDetail={renderDetail} />);
  expect(screen.queryByRole('tab', { name: '근거 상세' })).toBeNull();
  expect(renderDetail).not.toHaveBeenCalled();
  fireEvent.click(row());
  expect(renderDetail).toHaveBeenCalled();
  expect(renderDetail.mock.lastCall![1]).toContain(OCCURRENCE);
});

it('resets the cursor and selection when resetKey changes', () => {
  const view = render(<FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey="a" />);
  const initial = shownAt();
  fireEvent.click(row());
  expect(shownAt()).not.toBe(initial);
  expect(row().getAttribute('aria-selected') ?? row().getAttribute('data-selected')).not.toBeNull();
  view.rerender(<FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey="b" />);
  expect(shownAt()).toBe(initial);
});
