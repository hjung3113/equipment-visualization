import type { SceneState } from '@eqv/core';

export type StateEvidence = SceneState['materials'][number]['locationEvidence'];
export const ACTIVITY_KO = { processing: '처리 중', 'post-processing': '후처리', function: '기능' } as const;
export const UNKNOWN_LANE = '위치 미확인';
export const NO_TIME = '시각 없음';
/** The `.fff` of a Site Wall-clock string unless it is `.000`: milliseconds show only where they carry a difference. */
const fraction = (t: string) => t.slice(19) === '.000' ? '' : t.slice(19);
/** `HH:mm:ss` (+ `.fff` when not zero) of a Site Wall-clock string; a display cut, not a conversion. */
export const clock = (t: string) => t.slice(11, 19) + fraction(t);
/** `YYYY-MM-DD HH:mm:ss` (+ `.fff` when not zero) of a Site Wall-clock string; a display cut, not a conversion. */
export const wallClockText = (t: string) => `${t.slice(0, 10)} ${clock(t)}`;
