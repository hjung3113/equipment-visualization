import type { EvidenceLevel } from './schema.js';

/** The one definition of the evidence words (REPLAY-CONTRACT 데이터 신뢰 표시); every package that prints a level imports it. */
export const LEVEL_KO: Record<EvidenceLevel, string> = { observed: '관측', derived: '파생', unknown: '미확인', illustrative: '예시' };
