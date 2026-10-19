import { expect, it } from 'vitest';
import { rowSlice } from '../src/row-cap.js';

it.each([
  ['small list: no cap', 10, 5, 500, { start: 0, end: 10, capped: false }],
  ['exactly the cap: no cap', 500, 499, 500, { start: 0, end: 500, capped: false }],
  ['large list: centred on the cursor row', 2000, 1000, 500, { start: 750, end: 1250, capped: true }],
  ['selection outside the previous slice: the slice moves', 2000, 1700, 500, { start: 1450, end: 1950, capped: true }],
  ['start edge', 2000, 3, 500, { start: 0, end: 500, capped: true }],
  ['end edge', 2000, 1999, 500, { start: 1500, end: 2000, capped: true }],
  ['out-of-range centre is clamped', 2000, -5, 500, { start: 0, end: 500, capped: true }],
])('%s', (_name, total, center, max, expected) => {
  expect(rowSlice(total, center, max)).toEqual(expected);
});
