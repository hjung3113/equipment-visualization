import type { EvidenceLevel, SceneState } from '@eqv/core';

export type StateEvidence = SceneState['materials'][number]['locationEvidence'];
/** Evidence words (REPLAY-CONTRACT 데이터 신뢰 표시). Literals here: this package does not import the renderer. */
export const EVIDENCE_KO: Record<StateEvidence, string> = { observed: '관측', derived: '파생', unknown: '미확인' };
/** Source evidence levels, which also include `illustrative`. */
export const LEVEL_KO: Record<EvidenceLevel, string> = { ...EVIDENCE_KO, illustrative: '예시' };
export const ACTIVITY_KO = { processing: '처리 중', 'post-processing': '후처리', function: '기능' } as const;
export const UNKNOWN_LANE = '위치 미확인';
export const NO_TIME = '시각 없음';
/** `HH:mm:ss.fff` of a Site Wall-clock string; a display cut, not a conversion. */
export const clock = (t: string) => t.slice(11);
