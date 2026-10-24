import { expect, it } from 'vitest';
import { activeBinding, latestBinding, type Binding } from '../src/index.js';

const closed: Binding = { layoutId: 'closed', mappingHash: `sha256:${'a'.repeat(64)}`,
  effectiveFrom: '2026-01-01T10:00:00.000', effectiveTo: '2026-01-01T11:00:00.000' };
const open: Binding = { layoutId: 'open', mappingHash: closed.mappingHash, effectiveFrom: closed.effectiveTo! };

it.each([
  { name: 'inclusive start', bindings: [closed], at: closed.effectiveFrom, expected: closed },
  { name: 'exclusive end', bindings: [closed], at: closed.effectiveTo!, expected: undefined },
  { name: 'open end', bindings: [closed, open], at: '2026-01-02T10:00:00.000', expected: open },
  { name: 'no active binding', bindings: [closed, open], at: '2026-01-01T09:00:00.000', expected: undefined },
  { name: 'empty input', bindings: [], at: closed.effectiveFrom, expected: undefined },
  { name: 'first matching binding', bindings: [closed, { ...closed, layoutId: 'overlap' }], at: closed.effectiveFrom, expected: closed },
])('selects the active Binding: $name', ({ bindings, at, expected }) => {
  expect(activeBinding(bindings, at)).toEqual(expected);
});

it.each([
  { name: 'unordered input', bindings: [open, closed], expected: open },
  { name: 'equal starts keep the first', bindings: [open, { ...open, layoutId: 'tie' }, closed], expected: open },
  { name: 'empty input', bindings: [], expected: undefined },
])('selects the latest Binding: $name', ({ bindings, expected }) => {
  expect(latestBinding(bindings)).toEqual(expected);
});
