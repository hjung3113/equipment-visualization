import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  aliasMetadataFileSchema, bindingsFileSchema, buildInventory, layoutDocumentSchema, mappingVersionSchema, occurrenceBatchSchema,
  typeDictionaryFileSchema, type MappingVersion, type TemplateDocument,
} from '@eqv/core';

// vitest runs with cwd = packages/editor; import.meta.url is not a file URL under jsdom.
const repo = resolve(process.cwd(), '../..');
export const read = (path: string) => JSON.parse(readFileSync(join(repo, path), 'utf8'));
const onboarding = 'fixtures/cluster-single/onboarding';

export const record = { schemaVersion: '0.4', equipmentId: 'eq-synth-01', maker: 'synth-maker', model: 'synth-model' } as const;
export const dictionaries = [typeDictionaryFileSchema.parse(read(`${onboarding}/scopes/model/synth-maker/synth-model/type-dictionary.json`))];
export const inventory = () => buildInventory(occurrenceBatchSchema.parse(read('fixtures/cluster-single/occurrence-batch.json')),
  aliasMetadataFileSchema.parse(read(`${onboarding}/alias-metadata.json`)));
export const bindings = bindingsFileSchema.parse(read(`${onboarding}/bindings/eq-synth-01.bindings.json`));
export const mappings: Record<string, MappingVersion> = Object.fromEntries(
  readdirSync(join(repo, `${onboarding}/mappings/eq-synth-01`)).map((name) => {
    const mapping = mappingVersionSchema.parse(read(`${onboarding}/mappings/eq-synth-01/${name}`));
    return [mapping.hash, mapping];
  }));
export const templates = (): TemplateDocument[] => readdirSync(join(repo, 'assets/templates'))
  .filter((name) => name.endsWith('.template.json'))
  .map((name) => layoutDocumentSchema.parse(read(`assets/templates/${name}`)) as TemplateDocument);
export const fixtureTemplates = (): TemplateDocument[] => ['cluster-single', 'cluster-dual-hub', 'linear-track'].map((id) =>
  layoutDocumentSchema.parse(read(`fixtures/templates/${id}.template.json`)) as TemplateDocument);
