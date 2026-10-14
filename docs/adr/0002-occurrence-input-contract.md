---
status: accepted
---

# Replay 입력은 원천이 짝지은 Occurrence이며, 원천 adapter는 저장소 밖에 둔다

Replay core는 Start/End 점 이벤트를 받아 짝짓지 않고, 원천 parser가 이미 확정한 **Occurrence**(열린 것은 `end=null`)와 **Data Quality Issue**를 입력으로 받는다. 상태 적용 순서는 원천의 **Record Sequence**이고 timestamp는 순서가 아닌 값이다. 사내 parser(context_recognized_parser)는 이미 결정론적 Start/End 매칭, 파일 경계 carryover, 강제 종료 사유, DataQuality를 소유한다. 같은 규칙을 replay에서 다시 구현하면 두 결과가 어긋나고 그 어긋남이 화면에서 근거처럼 보이기 때문이다.

원천 Result를 Occurrence로 변환하는 adapter는 이 저장소에 두지 않는다. 플랫폼 서버의 read view(`equipment.topview.events`)가 담당하고, 이 저장소는 범용 계약과 원천과 같은 모양의 synthetic fixture만 가진다. parser는 실제 설비 어휘를 담고 있어 독립·공개 경계 안에 둘 수 없다.

## Considered Options

- **Core가 point event를 짝지음**: 원천 독립성은 높지만 parser 매칭 규칙의 중복 구현이 된다. Start/End만 주는 다른 원천이 생기면 그 원천의 adapter가 짝짓는다.
- **Timestamp 정렬 + sequence tie-break**: parser 원칙(Timestamp는 순서 근거가 아님)과 충돌한다.

## Consequences

- 완료 Result만 저장하는 원천에서는 진행 중 Occurrence가 보이지 않는다. 원천에 열린 Occurrence read view를 요청하고, 그 전까지 Watermark 이후는 근거 부재(`unknown`)로 표시한다.
- 구간 조회는 "구간 안에서 시작한 것"이 아니라 "구간과 겹치는 것"이므로 중간 진입 시 초기 상태를 snapshot 없이 복원한다.
- Record Sequence와 timestamp가 어긋난 경계는 Time Anomaly로 표시하고 영향 객체를 그 구간에서 `unknown`으로 둔다.
