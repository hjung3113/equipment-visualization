import { z } from 'zod';

const name = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
export const equipmentRecordSchema = z.strictObject({
  schemaVersion: z.literal('0.4'), equipmentId: name, maker: name, model: name,
}).describe('Equipment identity for Studio: which maker and model scopes apply to an equipmentId.');
export type EquipmentRecord = z.infer<typeof equipmentRecordSchema>;
