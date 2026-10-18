import { expect, it } from 'vitest';
import { proposeTemplates, typeDictionaryFileSchema } from '@eqv/core';
import { formatProposalEvidence } from '../src/index.js';
import { dictionaries, fixtureTemplates, inventory, templates } from './data.js';

it('formats evidence sentences for every fixture proposal', () => {
  const proposals = proposeTemplates({ inventory: inventory(), dictionaries, templates: fixtureTemplates() });
  expect(proposals).toHaveLength(3);
  expect(formatProposalEvidence(proposals[0]!)).toBe('LL 1/1 ✓, LP 1/1 ✓, PM 3 (1–6) ✓, ROBOT 2/2 ✓, 이송 7/7 ✓, 설명 안 되는 alias 2');
  expect(formatProposalEvidence(proposals[2]!)).toContain('이송 0/7 ✗');
});

it('formats a proposal with no transfers', () => {
  const input = inventory();
  input.aliases = [{ ...input.aliases.find(({ alias }) => alias === 'PM1')!, alias: 'pm-a', moduleType: undefined }];
  input.transfers = [];
  const [proposal] = proposeTemplates({ inventory: input, dictionaries, templates: templates().filter(({ id }) => id === 'cluster-single') });
  expect(formatProposalEvidence(proposal!)).toBe('이송 없음, 설명 안 되는 alias 1');
});

it('formats an open-vocabulary Role named like an Object.prototype key', () => {
  const input = inventory();
  input.aliases = [{ ...input.aliases.find(({ alias }) => alias === 'PM1')!, moduleType: 'SYN_CONSTRUCTOR' }];
  input.transfers = [];
  const dictionary = typeDictionaryFileSchema.parse({ schemaVersion: '0.4', scope: { level: 'global' },
    entries: [{ moduleType: 'SYN_CONSTRUCTOR', role: 'constructor' }] });
  const [proposal] = proposeTemplates({ inventory: input, dictionaries: [dictionary], templates: templates().filter(({ id }) => id === 'cluster-single') });
  expect(formatProposalEvidence(proposal!)).toBe('CONSTRUCTOR 1 (0–0) ✗, 이송 없음, 설명 안 되는 alias 1');
});
