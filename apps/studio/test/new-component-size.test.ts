import { expect, it } from 'vitest';
import type { Component, LayoutDocument } from '@eqv/core';
import { newComponentSize } from '../src/new-component-size.js';

const component = (assetRef: string, size?: Component['size'], scale = 1): Component => ({
  id: 'part', role: 'pm', label: 'Synthetic part', assetRef, levelId: 'l1',
  transform: { x: 0, y: 0, rotation: 0, scale }, ports: [], holdingSites: [], provenance: {},
  ...(size ? { size } : {}),
});
const layout = (components: Component[]): LayoutDocument => ({
  schemaVersion: '0.4', kind: 'equipment-layout', templateId: 'generic', id: 'synthetic', name: 'Synthetic', unit: 'abstract',
  viewBox: { x: 0, y: 0, width: 100, height: 100 }, sources: [],
  levels: [{ id: 'l1', label: 'Main', order: 0 }],
  components: components.map((part, i) => ({ ...part, id: `part-${i}` })),
  physicalInterfaces: [], transferCapabilities: [], processRoutes: [],
});

it.each([
  { name: 'three size-less generic boxes', parts: Array.from({ length: 3 }, () => component('generic-box')), asset: 'pm', expected: { width: 7.686, height: 8 } },
  // Scaled longer sides are 8, 12, 20, 40: their median is 16.
  { name: 'mixed footprints with own scale and an even count', parts: [component('generic-box'), component('primitive:pm', { width: 6, height: 3 }, 2), component('unknown', { width: 20, height: 10 }), component('generic-box', { width: 10, height: 40 })], asset: 'robot-single', expected: { width: 16, height: 16 } },
  { name: 'natural primitive and unknown fallbacks', parts: [component('primitive:robot-single', undefined, 2), component('primitive:missing'), component('unknown', { width: 100, height: 20 })], asset: 'robot-single', expected: { width: 100, height: 100 } },
  { name: 'non-square primitive aspect ratio', parts: [component('generic-box', { width: 101.76, height: 50 })], asset: 'pm', expected: { width: 97.76, height: 101.76 } },
])('sizes a new Component from $name', ({ parts, asset, expected }) => {
  expect(newComponentSize(layout(parts), asset)).toEqual(expected);
});
