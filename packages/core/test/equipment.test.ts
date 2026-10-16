import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { equipmentRecordSchema } from '../src/index.js';

const seed = JSON.parse(readFileSync(new URL('../../../assets/equipment/eq-synth-01.json', import.meta.url), 'utf8'));

it('accepts the seed equipment record', () => {
  expect(equipmentRecordSchema.parse(seed)).toEqual({ schemaVersion: '0.4', equipmentId: 'eq-synth-01', maker: 'synth-maker', model: 'synth-model' });
});

it.each([
  ['an extra key', { extra: 1 }],
  ['a bad maker', { maker: '../maker' }],
  ['a wrong schemaVersion', { schemaVersion: '0.3' }],
])('rejects %s', (_, change) => {
  expect(equipmentRecordSchema.safeParse({ ...seed, ...change }).success).toBe(false);
});
