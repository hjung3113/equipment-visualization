import { z } from 'zod';

// Site Wall-clock (CONTEXT.md): naive "YYYY-MM-DDTHH:mm:ss.fff", no timezone; compare as strings, never via Date.
export const siteWallClockSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/);
export type SiteWallClock = z.infer<typeof siteWallClockSchema>;
