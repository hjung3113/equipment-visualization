---
status: accepted
---

# Evidence Level은 4단계이며 facet마다 붙는다

Replay가 보여주는 모든 상태는 `observed | derived | illustrative | unknown` 중 하나의 Evidence Level을 가지며, 이 등급은 Occurrence 전체가 아니라 facet(location, material identity, start, end)마다 붙는다. 같은 Occurrence 안에서도 자리는 직접 관측되었지만 wafer ID는 추론되었거나, 시작은 정상이지만 종료는 강제 종료일 수 있다. action 단위 등급은 이 차이를 가장 약한 쪽이나 가장 강한 쪽으로 뭉개 버린다. 규칙 기반 계산은 `derived`로 부르고 `reconstructed`는 쓰지 않는다. 레이아웃 속성의 확실성은 별도 축인 Certainty(`verified | assumed | unknown`)이며 `confidence`라는 단어는 어디에도 쓰지 않는다.

## Consequences

- context_recognized_parser 필드 대응: `*_exact=true`·`EndReason=Normal` 경계 → observed; fallback 경계·`Forced*` 종료 → 해당 경계만 derived; `is_synthetic` → derived; Wafer는 Start/End 직접 Resolved → observed, Inferred → derived, `Empty`/`Unknown` → identity unknown; Data Quality Issue → 상태를 바꾸지 않는 unknown 마커.
- 관측 이후 다음 근거까지 이어지는 상태는 원래 등급을 유지하되, Watermark상 근거가 끊긴 구간에서는 `unknown`으로 강등한다.
- Handler(로봇) 위의 이송 중 물질은 Location=Handler, `derived`. Holding Site는 Mapping이 arm slot을 해석할 때만 붙는다.
