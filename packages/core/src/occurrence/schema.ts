import { z } from 'zod';

import { siteWallClockSchema } from '../site-wall-clock.js';

const sourceIdSchema = z.string().min(1);
const sequenceSchema = z.int().nonnegative();
export const evidenceLevelSchema = z.enum(['observed', 'derived', 'illustrative', 'unknown']);
export const boundarySchema = z.strictObject({
  at: siteWallClockSchema.nullable(),
  seq: sequenceSchema,
  evidence: evidenceLevelSchema,
  reason: z.string().optional(),
});
const aliasLocationSchema = z.strictObject({
  moduleAlias: sourceIdSchema,
  slotAlias: sourceIdSchema.optional(),
});
export const occurrenceSchema = z.strictObject({
  id: sourceIdSchema,
  equipmentId: sourceIdSchema,
  kind: z.enum(['VISIT', 'TRANSFER', 'PROCESS', 'POST_PROCESS', 'FUNCTION', 'CARRIER_PRESENCE']),
  start: boundarySchema,
  end: boundarySchema.nullable(),
  location: aliasLocationSchema.optional(),
  from: aliasLocationSchema.optional(),
  to: aliasLocationSchema.optional(),
  material: z.strictObject({
    kind: z.enum(['wafer', 'carrier', 'batch', 'boat', 'reticle']),
    id: sourceIdSchema.nullable(),
    identityEvidence: evidenceLevelSchema,
    lotId: sourceIdSchema.optional(),
    jobId: sourceIdSchema.optional(),
  }).optional(),
  synthetic: z.boolean(),
  source: z.strictObject({
    parserContractVersion: z.string(),
    dataGeneration: z.string(),
    recordRef: z.string().optional(),
  }),
});
export const dataQualityIssueSchema = z.strictObject({
  id: sourceIdSchema,
  equipmentId: sourceIdSchema,
  issueType: z.string(),
  seq: sequenceSchema,
  at: siteWallClockSchema.nullable(),
  relatedOccurrenceId: sourceIdSchema.optional(),
});
export const occurrenceBatchSchema = z.strictObject({
  equipmentId: sourceIdSchema,
  from: siteWallClockSchema,
  to: siteWallClockSchema,
  timeDomain: z.string(),
  watermark: z.strictObject({ seq: sequenceSchema, at: siteWallClockSchema }),
  parserContractVersion: z.string(),
  dataGeneration: z.string(),
  occurrences: z.array(occurrenceSchema),
  issues: z.array(dataQualityIssueSchema),
  continuationToken: z.string().optional(),
});

export type EvidenceLevel = z.infer<typeof evidenceLevelSchema>;
export type Boundary = z.infer<typeof boundarySchema>;
export type Occurrence = z.infer<typeof occurrenceSchema>;
export type DataQualityIssue = z.infer<typeof dataQualityIssueSchema>;
export type OccurrenceBatch = z.infer<typeof occurrenceBatchSchema>;
