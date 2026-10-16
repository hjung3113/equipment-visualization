import { z } from 'zod';
import { idSchema } from '../layout/schema.js';
import { siteWallClockSchema } from '../site-wall-clock.js';

const text = z.string().min(1);
export const mappingScopeSchema = z.discriminatedUnion('level', [
  z.strictObject({ level: z.literal('global') }),
  z.strictObject({ level: z.literal('maker'), maker: text }),
  z.strictObject({ level: z.literal('model'), maker: text, model: text }),
  z.strictObject({ level: z.literal('equipment'), equipmentId: text }),
]);
export const typeDictionaryFileSchema = z.strictObject({
  schemaVersion: z.literal('0.4'), scope: mappingScopeSchema,
  entries: z.array(z.strictObject({ moduleType: text, role: idSchema })),
});
const slotMapSchema = z.strictObject({
  offset: z.int(),
  assign: z.array(z.strictObject({ from: z.int(), to: z.int(), holdingSiteId: idSchema })
    .refine(({ from, to }) => from <= to, { path: ['to'], message: 'to must be at least from' })).min(1),
});
const patternSchema = z.string().regex(/^(?:[^{}]|\{[a-z]+\})*$/);
const targetTemplateSchema = z.string().min(1).regex(/^(?:[^{}]|\{[a-z]+(?::letter)?\})+$/);
const ignoreSchema = z.strictObject({ ignore: z.literal(true) });
const ruleTargetSchema = z.union([
  ignoreSchema, z.strictObject({ componentId: targetTemplateSchema, slots: slotMapSchema.optional() }),
]);
const certaintySchema = z.enum(['verified', 'assumed']);
const aliasRuleSchema = z.strictObject({
  id: idSchema,
  match: z.union([z.strictObject({ exact: z.array(z.string()).min(1) }), z.strictObject({ pattern: patternSchema })]),
  target: ruleTargetSchema, certainty: certaintySchema,
}).refine((rule) => !('exact' in rule.match && 'componentId' in rule.target && /[{}]/.test(rule.target.componentId)), {
  path: ['target', 'componentId'], message: 'Exact targets cannot contain captures',
});
export const aliasRulesFileSchema = z.strictObject({
  schemaVersion: z.literal('0.4'), scope: mappingScopeSchema, rules: z.array(aliasRuleSchema),
});
const mappingTargetSchema = z.union([
  ignoreSchema, z.strictObject({ componentId: idSchema, slots: slotMapSchema.optional() }),
]);
const hashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const mappingEntrySchema = z.strictObject({
  alias: z.string(), target: mappingTargetSchema, certainty: certaintySchema,
  rule: z.strictObject({ scope: mappingScopeSchema, ruleId: idSchema }),
});
export const mappingVersionSchema = z.strictObject({
  schemaVersion: z.literal('0.4'), equipmentId: text, layoutId: idSchema,
  entries: z.array(mappingEntrySchema), hash: hashSchema,
});
const bindingSchema = z.strictObject({
  layoutId: idSchema, mappingHash: hashSchema, layoutRevision: hashSchema.optional(),
  effectiveFrom: siteWallClockSchema, effectiveTo: siteWallClockSchema.optional(),
});
export const bindingsFileSchema = z.strictObject({
  schemaVersion: z.literal('0.4'), equipmentId: text, bindings: z.array(bindingSchema),
});
export type MappingScope = z.infer<typeof mappingScopeSchema>;
export type TypeDictionaryFile = z.infer<typeof typeDictionaryFileSchema>;
export type AliasRulesFile = z.infer<typeof aliasRulesFileSchema>;
export type AliasRule = z.infer<typeof aliasRuleSchema>;
export type SlotMap = z.infer<typeof slotMapSchema>;
export type MappingVersion = z.infer<typeof mappingVersionSchema>;
export type MappingEntry = z.infer<typeof mappingEntrySchema>;
export type BindingsFile = z.infer<typeof bindingsFileSchema>;
export type Binding = z.infer<typeof bindingSchema>;
export type MappingIssue = {
  code: 'schema' | 'duplicate-entry' | 'duplicate-id' | 'duplicate-alias' | 'unknown-capture' |
    'scope-mismatch' | 'same-level-overlap' | 'unknown-target' | 'binding-overlap' | 'binding-order' | 'overlapping-slots';
  path: (string | number)[];
  message: string;
};
export type Resolution =
  | { kind: 'location'; componentId: string; holdingSiteId?: string; slotStatus: 'none' | 'mapped' | 'unmapped'; certainty: 'verified' | 'assumed'; mappingHash: string; layoutId: string }
  | { kind: 'ignored'; mappingHash: string }
  | { kind: 'unknown'; reason: 'no-binding' | 'missing-mapping' | 'unmapped-alias' };
