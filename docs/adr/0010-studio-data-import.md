---
status: accepted
---

# Studio는 저장소 밖 데이터 루트에 설비 기록과 불변 Sample Window를 가져오기 endpoint로만 추가하고, 검증 실패는 고치지 않고 거부한다

결정자: 소유자 — 승인(2026-10-18, #96).

운영자는 자기 설비로 Onboarding(Inventory → Template 제안 → Mapping Board → Publish)과 Focus 재생을 해 볼 수 있어야 한다. 그런데 지금 Studio에는 데이터를 넣는 길이 없다. `equipment/`와 `observations/`는 읽기 전용(쓰기 403, ONBOARDING §7)이고, 설비마다 batch 파일 하나만 읽는다. 그래서 Studio는 synthetic 설비 두 대 말고는 쓸 수 없다(`.review/wave/73f/VALUE-ASSESSMENT.md` 권고 1).

Studio는 다음 네 가지를 **가져오기 endpoint**(`/api/import/*`, dev 서버 파일 API의 일부)로만 쓴다. 일반 `PUT /api/files`로 `equipment/`·`observations/`에 쓰는 것은 계속 403이다.

1. **설비 기록** `equipment/<equipmentId>.json`(`equipmentRecordSchema`, 기존 형식 그대로): create-only. 같은 id가 있으면 412다. macOS 기본 파일 시스템은 대소문자를 구분하지 않으므로, 대소문자만 다른 기존 `equipmentId`·`maker`·`model`이 있으면 409로 거부한다. 경로가 겹쳐 다른 설비나 Scope의 파일을 덮는 일을 막기 위해서다. 등록 후 수정·삭제는 Studio에서 하지 않는다.
2. **Sample Window** `observations/<equipmentId>/windows/<from>_<to>_<hex>.batch.json`: 완전한 `OccurrenceBatch` 하나다. `<from>`/`<to>`는 batch 구간에서 `-`와 `:`를 뺀 값(`20260101T100000.000`)이고, `<hex>`는 `replayKey`의 관측 집합 해시와 같은 규칙(Occurrence·DQI를 `id` 순으로 정렬한 canonical JSON의 SHA-256)이다. 서버가 이름을 계산한다. 불변이며 append-only다. 같은 이름이 있으면 내용이 같을 때만 200(멱등)이고, 다르면 409다.
3. **Alias metadata** `observations/<equipmentId>/alias-metadata.json`(`aliasMetadataFileSchema`, 기존 형식): adapter가 공급하는 alias 설명(`moduleType`/`isPort`/`isRobot`)이다. 관측이 아니므로 확인 후 교체할 수 있다. 첫 쓰기는 `If-None-Match: *`이고, 교체는 화면에서 차이(추가·삭제·변경 alias)를 보이고 확인한 뒤에만 한다. 게시 때의 Inventory는 Baseline으로 이미 불변이므로(ADR-0007) 교체가 과거 게시를 바꾸지 않는다.
4. **Model 범위 Type Dictionary** `onboarding/scopes/model/<maker>/<model>/type-dictionary.json`(기존 경로와 validator): 새 maker/model에는 사전이 없어 모든 Role이 `unknown`이 되고 Template 제안이 무의미해지기 때문에 가져오기 흐름에 넣는다. 첫 쓰기만 이 endpoint로 하며 create-only다. 이후 수정은 기존 규칙과 같다.

**데이터 루트.** 가져오기는 dev 서버의 데이터 루트(`EQV_STUDIO_ASSETS`, 미설정이면 저장소 `assets/`)에 쓴다. 데이터 루트의 realpath가 이 저장소 작업 트리 안이면 가져오기 쓰기 endpoint 전부가 403이고, 사유("저장소 밖 경로를 `EQV_STUDIO_ASSETS`로 지정하세요")를 돌려준다. `GET /api/import/status`는 200으로 `enabled: false`와 같은 사유를 알린다. 경고에서 그치지 않는 이유는 한 번의 실수 커밋으로 회사 데이터가 공개 저장소에 들어가기 때문이다. `EQV_STUDIO_ASSETS`가 이미 있으므로 거부는 싸다. 루트가 다른 git 작업 트리 안이면(비공개 데이터 저장소일 수 있다) 거부하지 않고 화면에 경고만 한다. 읽기와 기존 쓰기 경로(초안, 규칙, Publish)는 바뀌지 않는다. 저장소 `assets/`의 synthetic 데모는 그대로 동작한다. 데이터 루트에 `templates/`가 없으면 `templates/` 읽기는 저장소의 번들 카탈로그(`assets/templates/`)에서 하고, 상태 endpoint와 화면이 어느 카탈로그를 쓰는지 알린다. primitive는 이미 renderer에 번들되어 있다.

**검증: 고치지 않고 거부한다.** 서버와 화면은 core의 같은 순수 함수(`validateSampleWindow(raw, { equipmentId, existing })`)를 쓴다. 이 함수는 첫 문제에서 멈추지 않고 모든 문제를 `{ code, path, message }`로 모은다. 서버 판정이 최종이다. 거부 사유는 다음과 같다.

- **형식:** strict `occurrenceBatchSchema` 위반(알 수 없는 필드 포함). 실패 메시지에는 "원천이 짝지은 Occurrence만 가져옵니다. Start/End 점 이벤트나 원시 로그는 원천 변환기에서 Occurrence로 바꾼 뒤 가져오세요(ADR-0002)"를 함께 보인다. Start/End를 짝짓지 않으며, 원시 로그를 받는 입력은 어디에도 없다.
- **시각:** ADR-0009 형식이 아닌 값(`fraction-too-long`, `fraction-missing`, `offset`, `malformed-time`). 자르거나 채우지 않는다. `from < to`가 아니면 거부한다. `timeDomain`이 빈 문자열이면 거부한다. 같은 설비의 기존 window와 `timeDomain`이 다르면 `time-domain-mismatch`로 거부한다. 시간대 변환은 어디에서도 하지 않는다.
- **완전성:** `continuationToken`이 있으면 거부한다(미완료 page, #42). page를 이어 붙이지 않는다.
- **소유와 순서:** batch `equipmentId`가 등록된 설비와 경로의 id와 다르면 거부한다. 모든 Occurrence·DQI record의 `equipmentId`, Record Sequence 유일성(`assertBatchRecords`, #42), Occurrence `id`와 DQI `id`의 유일성을 검사한다. id 중복은 `replayKey`가 id로 정렬하는 순서를 입력 배열이 정하게 만든다. 그래서 이 전제는 가져오기만이 아니라 `assertBatchRecords`에 넣어 replay와 Inventory도 거부하게 한다.
- **세대:** 각 Occurrence의 `source.parserContractVersion`·`source.dataGeneration`이 batch 값과 다르면 거부한다. Replay Key와 캐시 폐기는 batch의 Data Generation 하나를 쓰므로, 세대가 섞인 batch를 받으면 키가 사실과 다른 것을 말하게 된다.
- **구간:** 시각이 둘 다 있고 `[from, to)`와 겹치지 않는 것이 확실한 Occurrence는 거부한다(계약: batch는 구간과 겹치는 Occurrence를 담는다). 시각이 `null`이거나 경계가 뒤집힌(Time Anomaly) Occurrence는 판정하지 않고 그대로 받는다. 그것은 원천이 준 근거다.
- **window 겹침:** 같은 설비의 기존 window와 `[from, to)`가 겹치면 `window-overlap`(409)이다. 단, 내용이 같으면 멱등이다. 맞닿은 구간(`[a,b)`와 `[b,c)`)은 허용한다. 구간 경계를 걸친 긴 Occurrence는 두 window에 모두 들어 있을 수 있고, 그것은 정상이다.
- **크기:** 가져오기 endpoint 본문 상한은 32 MiB다(일반 파일 API는 5 MiB 그대로). 초과하면 413이다. 화면은 파일 크기를 먼저 검사해 같은 사유를 보인다.

거부가 아닌 표시(경고)도 있다. DQI는 개수와 `issueType`별로 보이며 그대로 저장한다. `relatedOccurrenceId`가 window 밖 Occurrence를 가리켜도 버리지 않는다. 열린 Occurrence(`end=null`), `at: null` 경계, 원천이 붙인 `illustrative`(REPLAY-CONTRACT에 따라 `unknown`으로 읽힘), identity `unknown`은 경계 근거 등급별 개수로 보인다(`EvidenceBadge`). 숨기거나 다른 값으로 바꾸지 않는다. Occurrence가 0건이면 "Inventory를 만들 수 없음"을 경고한다.

**Window 단위로 쓴다.** Sample Window는 Inventory와 Replay의 단위다. Studio는 window를 합치지 않는다. 합치려면 id 중복 제거와 경계 Occurrence의 판정이 필요하고, 그것은 원천의 일이다. Onboarding은 사용자가 고른 window 하나(기본: `from`이 가장 늦은 것)로 Inventory를 만든다. Publish의 Baseline Inventory도 그 window에서 나온다. Focus는 window 하나를 재생한다(`?window=<hex>`, 기본: anchor Occurrence를 담은 window 중 `from`이 가장 늦은 것, anchor가 없으면 `from`이 가장 늦은 window). 두 번째 window는 Drift 비교(`detectDrift`)의 입력이 된다. Drift 화면은 이 ADR의 범위가 아니다.

**고치기와 지우기는 Studio 밖이다.** 정정·재처리로 Data Generation이 바뀐 window는 기존 window와 겹치므로 거부된다. v1에는 대체·폐기 동작이 없다. 운영자는 데이터 루트의 파일을 직접 옮긴다(로컬 단일 사용자 도구). 재개 조건: 재처리된 세대를 가져와야 하는 실제 사례가 생길 때. 그때는 window 폐기(이동, 삭제 아님)와 Binding·Baseline 영향 표시를 함께 설계한다.

**dev 서버 전용, 운영 저장소 없음.** 가져오기는 기존 파일 API와 같이 `vite serve`에서만 존재한다(`apps/studio/server/plugin.ts`, `apply: 'serve'`). 인증·권한·동시성은 없다(ONBOARDING §8, #60의 last-write-wins 행). Studio는 저작·검증용 로컬 도구이고, 운영 사용자 화면의 기본 호스트는 플랫폼이다(#70, AP `docs/integration/platform-hosting-design.md` §6.3). 이 ADR은 배포 가능한 Studio 서버나 팀 공유 저장소를 만들지 않는다. 재개 조건: 소유자가 빌드된 Studio를 여러 사람이 쓰게 하려 할 때. 그때는 인증, 저장소, 동시성, 감사를 다룰 별도 ADR이 필요하다.

**플랫폼 호스트는 가져오기가 없다.** 플랫폼에서는 설비 식별이 플랫폼 설비 마스터 소유(AP ADR-0003)다. Occurrence는 플랫폼 서버 read view `equipment.topview.events`가 `OccurrenceBatch`로 준다(ADR-0002, `docs/INTEGRATION.md`). 그 view는 구간 조회이며 page(`continuationToken`)로 올 수 있고, `platform-adapter`가 전체 batch를 모은 뒤 replay에 넘긴다. Alias metadata와 긴 기간 Inventory는 `equipment.topview.inventory`가 준다. EV는 어느 호스트에서도 원시 로그를 파싱하지 않고 Start/End를 짝짓지 않는다. 두 호스트의 동등성은 같은 core 검증(`validateSampleWindow`의 형식·전제 검사)을 같은 입력에 적용해 확인한다(AP #335의 패키지 수준 동등성). 플랫폼 쪽 쓰기(초안·Publish)는 AP 쓰기 포트 ADR 뒤의 일이다(AP 설계 Q8).

## Considered Options

- **Studio 안에서 원시 로그나 Start/End 점 이벤트를 변환:** 운영자가 가장 편하다. 대신 ADR-0002를 어긴다(짝짓기 규칙 중복). 실제 설비 어휘가 공개 저장소에 들어온다. AGENTS.md의 "Sanitized, permissioned internal integrations belong in a separate deployment layer"와도 맞지 않는다. 기각한다. 변환기는 저장소 밖에 둔다.
- **저장소 `assets/`에 쓰고 경고만:** 설정 없이 바로 쓸 수 있다. 대신 실수 한 번이 기밀 데이터의 커밋이 된다. `.gitignore`로 막는 방법도 synthetic 데모 파일과 같은 디렉터리라 쓸 수 없다. 기각한다.
- **설비당 `occurrence-batch.json` 하나를 교체:** 지금 형식과 같다. 대신 같은 경로의 내용이 바뀌어 과거 Focus·dry-run 결과가 조용히 달라진다. 두 번째 window가 없으므로 Drift 비교도 할 수 없다. 기각한다. 저장소의 synthetic batch 두 개는 같은 PR에서 `windows/`로 옮기고 loader는 `windows/`만 읽는다. 외부 데이터 루트에는 아직 옛 경로 파일이 없으므로(가져오기가 없었다) 이행 부담이 없다.
- **window를 하나의 batch로 이어 붙이기:** 재생 구간 제약이 사라진다. 대신 겹치는 Occurrence의 중복 제거와 seq 정합을 Studio가 판정해야 한다. 그것은 원천의 일을 다시 하는 것이다. 기각한다.
- **일반 `PUT /api/files`로 `observations/`를 열기:** 코드가 가장 적다. 대신 클라이언트가 파일 이름을 정하고, 겹침 검사·본문 상한·저장소 루트 거부를 경로별로 따로 넣어야 한다. 기각한다. 가져오기는 ADR-0007의 `POST /api/layout-revisions`처럼 서버가 이름을 계산하는 전용 endpoint다.
- **window 목록 index 파일:** 큰 파일을 열지 않고 목록을 만든다. 대신 window 파일과 index 사이에 두 번째 commit point가 생긴다(ADR-0007이 피한 구조). 기각한다. 파일 이름에 구간과 해시를 넣어 디렉터리 목록만으로 고른다.
- **미리 집계한 `ObservedInventory`를 가져오기:** 30일 샘플(ONBOARDING §2)을 작은 파일로 가져올 수 있다. 대신 Inventory의 원천이 둘이 되어 어느 쪽이 이기는지 규칙이 필요하다. Baseline·Drift가 재생 근거와 다른 집합에서 나올 수 있다. 보류한다. 재개 조건: 필요한 샘플 기간이 32 MiB 상한을 넘는 실제 사례.
- **겹치는 window를 Data Generation이 다르면 허용(새 세대 우선):** 정정 흐름이 생긴다. 대신 Data Generation은 순서 없는 불투명 문자열이라 어느 쪽이 새것인지 알 수 없고, 같은 t에 두 답이 생긴다. 기각한다(위 재개 조건).
- **운영용 저장소(서버 DB·업로드 API)를 Studio에 추가:** 팀이 같이 쓸 수 있다. 대신 인증·권한·감사를 이 저장소가 소유하게 되어 플랫폼 소유 경계(ADR-0001, #70)와 겹친다. 기각한다.

## Consequences

- **구현 상태:** 이 ADR의 결정은 #97–#103에서 구현되었다(문서 정리 #104). 구현 이슈: core 검증 #97, synthetic fixture #98, windows 배치와 loader #99, import endpoint #100, 등록·Fleet 진입·데이터 페이지 #101, 가져오기 흐름 #102, window 선택 #103, 문서 정리 #104. 보류 항목은 #105, replay 성능은 #106이 맡는다.
- **ONBOARDING §7 규칙 변경:** "`equipment/`와 `observations/`는 Studio에서 읽기 전용이다(쓰기는 403)"를 다음으로 바꾼다. "일반 파일 API로는 쓰지 않는다(403). 가져오기 endpoint만 쓴다. 설비 기록은 create-only, Sample Window는 불변 추가, alias metadata는 확인 후 교체다. 데이터 루트가 이 저장소 안이면 가져오기를 거부한다." §7 파일 배치의 `occurrence-batch.json` 줄은 `windows/<from>_<to>_<hex>.batch.json`(불변)으로 바뀐다. "저장소에는 synthetic 설비만 둔다"는 그대로이며, 이제 서버가 강제한다.
- **`GLOSSARY.md`에 Sample Window를 추가한다:** "한 설비에 대해 가져온 완전한 OccurrenceBatch 하나와 그 조회 구간 `[from, to)`. 불변이며 Inventory와 Replay의 단위다. Studio는 window를 합치지 않는다. _Avoid_: Observation(입력 단위로서), snapshot." ONBOARDING §2의 "샘플 기간"은 Sample Window의 구간이다.
- **core:** `validateSampleWindow`, window 이름 계산·해석, 관측 집합 해시 함수(`replayKey`와 공유), ADR-0009 시각 진단, `assertBatchRecords`의 id 유일성 검사가 추가된다. 기존 batch와 fixture는 id가 유일하므로 계속 유효하다.
- **Studio 서버:** `/api/import/status`, `POST /api/import/equipment`, `POST /api/import/windows?equipmentId=`, `PUT /api/import/alias-metadata?equipmentId=`, `PUT /api/import/type-dictionary?maker=&model=`이 추가된다. 저장소 루트 거부, 템플릿 카탈로그 대체 읽기, 경로별 본문 상한도 들어간다.
- **Studio 화면:** Fleet의 "설비 등록"과 "관측 없음" 상태, 설비 데이터 페이지(window 목록, 가져오기 미리보기, 거부 사유 표, 결과 알림), Onboarding의 window 선택, Focus의 `window` 지정이 추가된다. 모두 `@eqv/ui`·`@fops/ui` 컴포넌트를 쓴다(ADR-0008).
- **알려진 한계(기록, 미구현):**
  - window 대체·폐기, 설비 기록 수정, 이름 규칙(`[A-Za-z0-9][A-Za-z0-9._-]*`) 밖의 실제 equipmentId는 지원하지 않는다. 이름은 바꾸지 않고 거부하며, 경로 인코딩은 별도 ADR이다.
  - 동시 가져오기의 겹침 검사는 원자적이지 않다. 단일 사용자 로컬 도구이므로 #60 last-write-wins 행과 같은 판단이다.
  - 큰 window의 Focus는 #106의 한 번의 정렬된 pass로 계산하고, Binding·Layout 탐색과 위치 해석을 포함한 timeline 계산 한도 또는 Gantt span 5,000개 한도를 넘으면 범위 안내를 보인다.
- **#53과의 관계:** 실제 설비로 여러 번 Publish하면 같은 `layoutId`의 Layout Revision이 여럿 생긴다. 그러면 #53의 재개 조건(한 소비자가 두 revision을 읽음)에 가까워진다. 이 ADR은 #53을 풀지 않는다. (#53/ADR-0011에서 해결: 각 Binding이 자기 Layout Revision을 읽고, 최신 Binding의 revision을 쓴다는 Focus loader 알림은 없어졌다.)
- **같은 PR에서 고칠 문서:**
  - `docs/ONBOARDING.md`: §7, :208 규칙, §2 샘플 기간 문장, 낡은 :3 상태 줄.
  - `GLOSSARY.md`: Sample Window.
  - `docs/INTEGRATION.md`: 플랫폼 호스트에는 가져오기가 없다는 문장, #44가 요청한 경로 정정.
  - `docs/DESIGN-v0.4.md` "Studio 저장": 가져온 데이터는 git 이력이 아니라 데이터 루트에 있다.
  - `apps/studio/README.md` File API 표: 구현 PR에서 고친다.
