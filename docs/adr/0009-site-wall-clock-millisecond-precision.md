---
status: accepted
---

# Site Wall-clock은 밀리초 3자리로 고정하고, 더 정밀한 원천 시각은 자르지 않고 거부한다

결정자: 소유자 — 승인(2026-10-18, #44).

EV가 받는 모든 Site Wall-clock(`Boundary.at`, DQI `at`, batch `from`/`to`/`watermark.at`, Binding `effectiveFrom`/`effectiveTo`, Inventory `firstSeen`/`lastSeen`)은 지금처럼 정확히 `YYYY-MM-DDTHH:mm:ss.fff`다(`packages/core/src/site-wall-clock.ts:4`). 소수 자릿수가 3이 아닌 값은 형식 오류로 거부하며, EV의 어느 단계도 시각을 자르거나 반올림하거나 채워 넣지 않는다. 원천 정밀도를 이 형식으로 옮기는 일은 저장소 밖 원천 adapter(플랫폼 서버 `equipment.topview.events`, 또는 Studio로 가져올 batch를 만든 변환기)가 한다. adapter는 값이 바뀌지 않는 표현 변경만 한다: 초 단위 값에 `.000`을 붙이거나, 마이크로·나노초 값의 끝자리 0을 떼는 것. 0이 아닌 1 ms 미만 자릿수가 하나라도 있으면 batch 전체를 내지 않고 실패한다.

EV의 순서·비교·해시·산술은 모두 "한 시각에 문자열 하나, 고정 폭"이라는 성질 위에 서 있다. reducer와 timeline은 `at <= t`를 문자열로 비교하고(`replay/reduce.ts:41,52,61,68,78`, `replay/timeline.ts:49-50`), Inventory는 `firstSeen`/`lastSeen`을 문자열로 고르며(`onboarding/inventory.ts`), Binding 순서 검사와 최신 Binding 선택도 문자열 비교다(`mapping/validate.ts:74-82`, Studio loader 여러 곳). Replay Key의 관측 집합 해시와 Baseline Inventory 파일은 canonical JSON 문자열의 SHA-256이다. 소수 자릿수가 바뀔 수 있으면 `10:00:00.5`와 `10:00:00.500`이 같은 시각인데 다른 문자열이 되어 이 비교와 해시가 모두 어긋난다. 반대로 지금까지 1 ms 미만 자릿수가 필요한 원천은 관측되지 않았다(#44). 근거 없는 일반화로 네 패키지를 다시 쓰기보다, 지원 범위를 명시하고 범위 밖을 조용히 망가뜨리지 않고 거부하는 쪽을 택한다.

## Considered Options

- **(A, 채택) 밀리초 고정, 범위 밖 거부(fail closed).** 코드 형식은 그대로다. 정밀도 손실은 구조적으로 일어날 수 없다. EV가 값을 바꾸지 않고 adapter가 손실 없는 표현만 만들기 때문이다. 대가는 1 ms 미만 정보가 있는 원천은 EV로 재생할 수 없다는 것이다. 그때는 오류가 나며, 틀린 화면이 나오지는 않는다.
- **(B1) 무손실, 고정 9자리(나노초) canonical 형식으로 정규화.** 고정 폭을 유지하므로 문자열 비교·해시 성질이 살아난다. 대신 모든 저장 값이 바뀐다. 스키마 스냅샷 4개(`occurrence-batch`, `bindings`, `observed-inventory`, `scene-state`), 기존 fixture·Bindings·Baseline Inventory 파일과 그 해시, 모든 Replay Key가 바뀐다. 게시된 Baseline은 불변이므로(ADR-0007) 같은 Mapping Version의 재게시가 409를 낸다. 밀리초 정수(`wallClockToMillis`)는 0001년부터 나노초를 세면 2^53을 넘으므로 `BigInt`나 (일, 일중 나노초) 쌍으로 바꿔야 하고, Gantt·재생·Focus 범위(`@eqv/replay`)의 `Number` 산술도 함께 바뀐다. 실제 원천이 나노초를 요구할 때의 이행 경로로 남긴다.
- **(B2) 무손실, 가변 자릿수(1–9)를 그대로 받고 값으로 비교.** 저장 값은 원천 그대로다. 대신 위에 적은 모든 문자열 비교를 비교 함수로 바꿔야 한다(core 6곳 이상, editor `publish.ts`, Studio loader. #60이 이미 "최신 Binding 규칙 6벌"을 지적했다). 한 시각에 문자열이 여럿 생겨, 같은 관측 집합이 다른 해시를 갖거나 해시 전에 정규화가 필요하다. 그 정규화가 곧 B1이다. 기각한다.
- **(C) batch 또는 timeDomain마다 정밀도를 선언(`timePrecision`).** batch 안에서는 고정 폭이지만, Binding·Baseline·여러 window처럼 batch를 넘는 값이 섞이면 폭이 달라 비교가 깨진다. 기각한다.
- **(D) 밀리초로 잘라서 받기.** #44와 AP 계약(원천 정밀도를 축소하지 않는다)을 모두 어기고, 같은 ms 안의 두 경계가 같은 시각으로 붙어 Time Anomaly 판정이 바뀐다. 기각한다.

## Consequences

- **`SiteWallClock`:** 정규식과 `wallClockToMillis`/`millisToWallClock`은 바뀌지 않는다. 가져오기와 같은 경계에서 사람이 읽을 거부 사유를 주기 위해, 형식 오류를 `fraction-too-long`(4자리 이상), `fraction-missing`(소수 없음), `offset`(`Z`·`+09:00`), `malformed`로 구분하는 진단 함수를 core에 둔다(ADR-0010의 가져오기 검증이 쓴다). 진단은 값을 고치지 않는다. 진단 함수는 아직 없다(구현: #97).
- **순서:** 상태 적용 순서는 계속 Record Sequence 하나다(ADR-0002). 같은 ms 안의 두 경계는 같은 문자열이며, 그 사이 순서는 원래부터 seq가 정한다. 이 결정으로 바뀌는 순서 규칙은 없다. Record Sequence는 JSON 안전 정수(`z.int()`, 2^53−1 이하)만 받는다. 그보다 큰 값은 JSON 파싱에서 이미 반올림되지만 스키마가 거부하므로, 조용히 다른 seq로 재생되지 않는다. 이것도 같은 fail-closed 원칙이다.
- **해시:** `replayKey`의 `observationHash`, Layout Revision(시각 없음), Mapping Version hash(시각 없음, ONBOARDING §5), Baseline Inventory, ADR-0010의 Sample Window 파일 이름 해시는 모두 그대로다. 한 시각에 문자열이 하나뿐이므로 "같은 내용이면 같은 해시"가 유지된다.
- **스키마 스냅샷:** `packages/core/schema/*.schema.json`은 바뀌지 않는다. JSON Schema의 `pattern`이 곧 이 결정의 공개 표현이다.
- **파생 값:** Focus 기본 범위, Gantt 커서, 재생 커서처럼 EV가 계산하는 시각은 ms 격자 위의 화면 값이다. 원천 값을 덮어쓰지 않으며 근거가 아니다. 반올림(`focus-range.ts:36`)은 계산한 범위에만 쓰고 원천 경계에는 쓰지 않는다.
- **URL 구간과 anchor는 다른 축이다.** EV Focus의 `anchor`는 Occurrence `id`(원천 occurrence anchor 기반, 불투명 문자열)다. 시각으로 파싱하거나 정규화·반올림하지 않는다. 플랫폼이 넘기는 `from`/`to`는 AP v1에서 초 정렬 `YYYY-MM-DDTHH:mm:ss`다(AP `docs/06_platform_ui_contract.md` §6.3). 호스트 adapter는 여기에 `.000`을 붙여 Site Wall-clock으로 바꾼다. 초 정렬 값이므로 손실이 없다. 경계 의미(`[from, to)`, `to=10:00:00`이면 `10:00:00.500` 제외)는 양쪽이 같다. EV는 소수초 URL 구간을 받지 않는다. AP v1이 그 입력을 막고, 막지 않더라도 EV 쪽 변환은 `.fff` 3자리만 허용한다.
- **AP 계약과의 관계:** AP §6.3은 "원천값·조인 키·occurrence anchor의 정밀도는 축소하지 않는다"이고, AP `docs/12_cycle_time_drilldown_wireframe.md`는 지금 초 단위 anchor만 열며 반올림 없이 거부한다. 이 ADR은 두 문장과 충돌하지 않는다. EV는 축소하지 않고 거부한다. 남는 일은 플랫폼 서버 쪽이다. `equipment.topview.events` adapter가 1 ms 미만 0이 아닌 자릿수를 만나면 batch를 자르지 말고 `outcome=error`(예: `time_precision_unsupported`)로 실패해야 한다. 이 저장소에서 AP를 고치지 않으며, AP 쪽 이슈는 열지 않는다. 지금 알려진 원천 중 소수 3자리를 넘는 것이 없기 때문이다(소유자, 2026-10-18). 그 규칙은 위 adapter 규칙으로 충분하다.
- **원천 adapter 규칙(문서화만, 이 저장소 밖):** 손실 없는 표현 변경만 허용한다(초 값에 `.000` 추가, 끝자리 0 제거). 값마다 판정한다. ms 정렬이 아닌 값이 하나라도 있으면 batch 전체를 내지 않는다(부분 batch 금지, #42와 같은 이유).
- **재개 조건:** 실제 원천이 0이 아닌 1 ms 미만 자릿수를 내거나, 플랫폼이 소수초 anchor·구간을 EV 시각 산술에 넘겨야 할 때. 그때는 B1을 이 ADR을 대체하는 새 ADR로 제안한다. 그 ADR은 스키마 스냅샷, 저장 파일 이행, Baseline 재게시 규칙, `BigInt` 산술을 함께 다룬다.
- **같은 PR에서 고칠 문서:**
  - `docs/REPLAY-CONTRACT.md` "시각" 줄에 "소수 3자리 고정, 더 정밀한 원천은 거부(ADR-0009)"를 적는다.
  - `GLOSSARY.md` **Site Wall-clock**에 같은 내용을 한 문장으로 적는다.
  - #44가 함께 요청한 `docs/INTEGRATION.md` 플랫폼 경로 정정(`menus/equipment` → `menus/analytics/equipment`, `menus/analytics` → `menus/analytics/analytics`, assembly/location-adapter 주입)은 ADR이 필요 없다. ADR-0010과 같은 PR에서 INTEGRATION을 고칠 때 함께 한다.
