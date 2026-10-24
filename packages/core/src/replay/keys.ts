import type { MaterialKind } from '../layout/schema.js';

export const materialKey = (kind: MaterialKind, id: string): string => `m:${kind}:${id}`;
export const occurrenceKey = (occurrenceId: string): string => `o:${occurrenceId}`;
