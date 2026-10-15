import { z } from 'zod';
import { occurrenceSchema } from '../occurrence/schema.js';
import { siteWallClockSchema } from '../site-wall-clock.js';

const inventoryAliasSchema = z.strictObject({
  alias: z.string().min(1),
  references: z.int().nonnegative(),
  slots: z.array(z.string().min(1)).describe('Distinct slots: signed decimal integers first by exact BigInt value, ties by code unit; then other strings by code unit.'),
  activity: z.array(z.strictObject({ kind: occurrenceSchema.shape.kind, count: z.int().nonnegative() })),
  firstSeen: siteWallClockSchema.nullable(),
  lastSeen: siteWallClockSchema.nullable(),
  moduleType: z.string().optional(),
  isPort: z.boolean().optional(),
  isRobot: z.boolean().optional(),
});
export const observedInventorySchema = z.strictObject({
  equipmentId: z.string().min(1),
  from: siteWallClockSchema,
  to: siteWallClockSchema,
  aliases: z.array(inventoryAliasSchema).describe('Sorted by alias in code-unit order; one reference per Occurrence per alias.'),
  transfers: z.array(z.strictObject({ from: z.string().min(1), to: z.string().min(1), count: z.int().nonnegative() }))
    .describe('TRANSFER pairs with both endpoints present, sorted by (from, to) in code-unit order.'),
});
export type InventoryAlias = z.infer<typeof inventoryAliasSchema>;
export type ObservedInventory = z.infer<typeof observedInventorySchema>;
