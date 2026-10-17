import type { SceneState } from '@eqv/core';
import type { IllustrativeGhost } from './ghosts.js';
import { ACTIVITY_KO, EVIDENCE_KO, UNKNOWN_LANE } from './words.js';

export interface CursorStateListProps {
  state: SceneState;
  /** Example-motion ghosts, passed only while the page's illustrative toggle is on. */
  illustrative?: readonly IllustrativeGhost[];
}

/** Text equivalent of the Top View replay layer at the cursor (the SVG layer is `aria-hidden`). */
export function CursorStateList({ state, illustrative = [] }: CursorStateListProps) {
  const active = state.components.filter((c) => c.activity !== 'no recorded activity');
  return (
    <section className="eqv-rp-state" aria-label="커서 시점 상태">
      <h3>커서 시점 상태 ({state.at})</h3>
      <p>{state.binding ? `Binding: ${state.binding.layoutId} · ${state.binding.mappingHash}` : '적용된 Binding 없음'}</p>
      <h4>Component 활동</h4>
      {active.length === 0 ? <p>기록된 활동 없음</p> : (
        <ul>
          {active.map((c) => (
            <li key={c.componentId}>
              {c.componentId}: {ACTIVITY_KO[c.activity as keyof typeof ACTIVITY_KO]} · 활동 근거 {EVIDENCE_KO[c.activityEvidence]}
            </li>
          ))}
        </ul>
      )}
      <h4>물질</h4>
      {state.materials.length === 0 ? <p>열려 있는 물질 없음</p> : (
        <ul>
          {state.materials.map((m) => (
            <li key={m.key}>
              {m.kind} {m.id ?? '익명'}: {m.location === null ? UNKNOWN_LANE
                : `${m.location.componentId}${m.location.holdingSiteId === undefined ? '' : ` / ${m.location.holdingSiteId}`}`}
              {' '}· 위치 근거 {EVIDENCE_KO[m.locationEvidence]} · 식별 근거 {EVIDENCE_KO[m.identityEvidence]}
            </li>
          ))}
        </ul>
      )}
      {illustrative.length > 0 && (
        <>
          <h4>예시 이동</h4>
          <ul>
            {illustrative.map((ghost) => (
              <li key={ghost.materialKey}>{ghost.label}: {ghost.fromComponentId} → {ghost.toComponentId} · 예시 이동 (관측 아님)</li>
            ))}
          </ul>
        </>
      )}
      {state.markers.length > 0 && (
        <>
          <h4>표식</h4>
          <ul>
            {state.markers.map((marker) => {
              switch (marker.kind) {
                case 'after-watermark': return <li key={marker.kind}>Watermark 이후 ({marker.watermarkAt})</li>;
                case 'time-anomaly': return <li key={`${marker.kind}:${marker.occurrenceId}`}>시각 역전 ({marker.occurrenceId})</li>;
                case 'occupancy-conflict':
                  return <li key={`${marker.kind}:${marker.componentId}:${marker.holdingSiteId}`}>점유 충돌 ({marker.componentId} / {marker.holdingSiteId}: {marker.materialKeys.join(', ')})</li>;
                case 'unmapped-alias': return <li key={`${marker.kind}:${marker.alias}:${marker.occurrenceId}`}>미매핑 alias ({marker.alias}, {marker.occurrenceId})</li>;
              }
            })}
          </ul>
        </>
      )}
    </section>
  );
}
