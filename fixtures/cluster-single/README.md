# Synthetic cluster-single OccurrenceBatch

This source-shaped fixture is synthetic: generic aliases, materials and times, with no real equipment vocabulary or logs. It supplies contract examples for reducer and Onboarding tests, not a physical layout or validated kinematics. The #9b files below supply the expected ObservedInventory, published Mappings, Bindings and Scene States.

The batch is for `eq-synth-01`, `timeDomain: site-synth`, `parserContractVersion: synthetic-1`, `dataGeneration: g1`, with window `[2026-01-01T10:00:00.000, 2026-01-01T10:30:00.000)`. All times are naive Site Wall-clock strings, compared as strings without timezone conversion. Intervals are `[start, end)` and the source has already paired each Occurrence. Record Sequence is global per equipment across boundaries and Data Quality Issues; timestamps do not determine application order.

## Conventions

- `VISIT`: material resting at `location`.
- `TRANSFER`: handler move; `location` is the handler alias (plus arm slot when known), with `from` and `to` source aliases. Normal handler transfers have observed exact/normal boundaries and observed Resolved identity, but material location during transfer is derived (ADR-0003 and REPLAY-CONTRACT “이송 중”). An arm slot is only a source alias until a Mapping resolves it; geometry establishes neither connectivity nor trajectory.
- `PROCESS`, `POST_PROCESS`, `FUNCTION`: module activity at `location`. Activity does not itself prove a material's location when no material is provided.
- `CARRIER_PRESENCE`: carrier at a load port, independently of wafer visits. No wafer is generated from carrier presence.
- `LP1`: load port, carrier plus wafer slots `1` and `2`; `EFEM_R1`: EFEM handler; `LLA`: load lock slots `1` and `2`; `TM_R1`: TM handler arm slots `1` and `2`; `PM1`: single-site process module; `PM2`: process module with independent slots `1` and `2`; `PM9`: deliberately unmapped in the published Mappings; `VIRT_SCH`: virtual module ignored by the published Mappings. These roles are scenario documentation, not Mapping data.
- Materials are `W01` through `W11`, carrier `C01`, and lots `LOT-A` and `LOT-B`. Empty and Unknown are distinct documented source-resolution cases with the same DTO shape (`id: null`, identity evidence unknown); no resolution-state field is invented.

T_BIND = `2026-01-01T10:04:30.000`. The outbound TM transfer spans this Binding switch. #9b supplies the Bindings below; location resets to unknown immediately after the switch until new evidence, without changing input boundary/identity labels.

Watermark is `2026-01-01T10:25:00.000`. ABSENT_RECORD = `2026-01-01T10:27:00.000`: a hypothetical completed-result boundary at this time is deliberately absent, with no fabricated DTO record or material. This models the source's completed-results-only gap; the separate open-occurrence view is represented by the open process. Beyond Watermark, location is unknown, never a claim of continued observed occupancy or idle state.

## Case links and evidence expectations

The second column quotes the applicable bullet from REPLAY-CONTRACT's test matrix. Evidence below names location, identity, start and end separately. Location expectations use v1 (verified) before T_BIND and v2 afterward (PM2 assumed, all other mapped aliases verified), and apply before Watermark and away from Time Anomaly/Binding boundaries. They describe future reducer output; the DTO contains only boundary and identity evidence. “Not applicable” means no material/end exists, not invented evidence. No illustrative evidence is present in this input.

| Case | Test-matrix item (verbatim bullet text) | Occurrence / issue ids | Expected evidence per facet |
| --- | --- | --- | --- |
| Normal carrier → LP → EFEM → LL → TM → PM process → return | Wafer identity Resolved/Inferred/Empty/Unknown, carrier-only Occurrence, Lot 필터 | `occ-carrier`, `occ-lp-slot-one`, `occ-efem-out`, `occ-lla-arrival`, `occ-tm-out`, `occ-pm1-process`, `occ-tm-return`, `occ-lla-return`, `occ-efem-return`, `occ-lp-return` | Location observed at resting modules/carrier port and derived on each Handler transfer; Resolved identity observed; start and end observed on every row. Carrier is separate from the wafer. |
| Open process at window end | 열린 Occurrence(end=null), Watermark 이후 구간, 구간 앞에서 시작한 Occurrence의 중간 진입 | `occ-open` | Location derived before Watermark (v2 PM2 assumed cap) and unknown afterward; identity observed; start observed; end absent, hence unknown, with no guessed end. |
| Mid-entry restore | 열린 Occurrence(end=null), Watermark 이후 구간, 구간 앞에서 시작한 Occurrence의 중간 진입 | `occ-carrier`, `occ-lp-slot-one` | Pre-window start and end observed; identity observed; location observed from overlapping source intervals, without inventing a snapshot. |
| Completed-result gap after Watermark (ABSENT_RECORD) | 열린 Occurrence(end=null), Watermark 이후 구간, 구간 앞에서 시작한 Occurrence의 중간 진입 | `occ-open` | Location unknown after Watermark; existing identity/start remain observed source facets; end unknown/absent. The absent record provides no evidence for any facet. |
| Forced end | 강제 종료(`Forced*`) 경계, fallback 경계, synthetic relocation transfer | `occ-forced` | Start observed; end derived with ForcedByNextStart; material location and identity not applicable (module-only activity). No downgrade of start. |
| Fallback start only | 강제 종료(`Forced*`) 경계, fallback 경계, synthetic relocation transfer | `occ-fallback` | Start derived for fallback time; end observed; material location and identity not applicable. No downgrade of end. |
| Synthetic relocation | 강제 종료(`Forced*`) 경계, fallback 경계, synthetic relocation transfer | `occ-relocation` | Location derived, start derived, end derived; identity observed independently of the synthetic movement. |
| Inferred wafer | Wafer identity Resolved/Inferred/Empty/Unknown, carrier-only Occurrence, Lot 필터 | `occ-inferred` | Resting location derived (v2 PM2 assumed cap); identity derived; start and end observed. |
| Empty resolution | Wafer identity Resolved/Inferred/Empty/Unknown, carrier-only Occurrence, Lot 필터 | `occ-identity-empty` | Identity unknown with null id; anonymous occupancy is placed under an `o:<occurrenceId>` key at PM1 (location observed); start and end observed. No wafer id is invented. DTO does not encode Empty vs Unknown. |
| Unknown resolution | Wafer identity Resolved/Inferred/Empty/Unknown, carrier-only Occurrence, Lot 필터 | `occ-identity-unknown` | Identity unknown with null id; anonymous occupancy is placed under an `o:<occurrenceId>` key at PM2/station-2 (location derived by assumed Mapping); start and end observed. No wafer id is invented. Distinction from Empty exists only in this case documentation. |
| Carrier-only row | Wafer identity Resolved/Inferred/Empty/Unknown, carrier-only Occurrence, Lot 필터 | `occ-carrier` | Carrier location observed, carrier identity observed, start and end observed; no wafer facet is manufactured. |
| Lot filter and both LP wafer slots | Wafer identity Resolved/Inferred/Empty/Unknown, carrier-only Occurrence, Lot 필터 | `occ-lp-slot-one`, `occ-lp-slot-two` | Locations observed on different slots; wafer identities observed; starts and ends observed. LOT-A and LOT-B are attributes, not location objects. |
| Two Handlers concurrently occupied | 두 Handler 동시 점유, 한 Handler 여러 Holding Site, multi-site PM 동시 점유(충돌 오탐 금지), 같은 Holding Site 이중 점유(충돌 검출) | `occ-efem-overlap`, `occ-tm-out` | Both Handler locations derived; both identities observed; starts and ends observed. Overlap does not imply a collision or trajectory. |
| LL second-slot rest | 두 Handler 동시 점유, 한 Handler 여러 Holding Site, multi-site PM 동시 점유(충돌 오탐 금지), 같은 Holding Site 이중 점유(충돌 검출) | `occ-lla-slot-two` | Location observed at LLA slot 2; identity observed; start and end observed. |
| One Handler, two occupied arm slots | 두 Handler 동시 점유, 한 Handler 여러 Holding Site, multi-site PM 동시 점유(충돌 오탐 금지), 같은 Holding Site 이중 점유(충돌 검출) | `occ-tm-out`, `occ-tm-arm-two` | Locations derived at TM_R1 arm slots 1 and 2 if mapped; identities observed; starts and ends observed. Arm aliases do not assert mechanics or blade counts. |
| Multi-site PM concurrent occupancy, no conflict | 두 Handler 동시 점유, 한 Handler 여러 Holding Site, multi-site PM 동시 점유(충돌 오탐 금지), 같은 Holding Site 이중 점유(충돌 검출) | `occ-pm2-slot-one`, `occ-pm2-slot-two` | Locations derived at distinct PM2 slots (v2 assumed cap); identities observed; starts and ends observed. Independent Holding Sites must not trigger double-occupancy conflict. |
| Same Holding Site double occupancy | 두 Handler 동시 점유, 한 Handler 여러 Holding Site, multi-site PM 동시 점유(충돌 오탐 금지), 같은 Holding Site 이중 점유(충돌 검출) | `occ-lla-conflict-one`, `occ-lla-conflict-two` | Input locations directly claim LLA slot 1 for distinct wafers; identities/start/end observed. Reducer must flag conflict, retaining competing observations without choosing a true occupant; unique occupancy is unknown. |
| EndBeforeStart and consecutive-record timestamp inversion | 동일 timestamp 다중 경계, Time Anomaly(EndBeforeStart, sequence/timestamp 역전), 시각 null 경계 | `occ-time-anomaly`, `dqi-end-before-start` | Raw start/end and identity observed; end has higher sequence but earlier time. Affected location unknown during anomaly. DQI is an unknown timeline marker and does not change state or relabel raw boundary evidence. |
| Consecutive-record inversion across otherwise normal intervals | 동일 timestamp 다중 경계, Time Anomaly(EndBeforeStart, sequence/timestamp 역전), 시각 null 경계 | `occ-unmapped`, `occ-ignored` | VIRT_SCH start follows PM9 start by sequence but has an earlier time; both individual intervals have positive duration. Raw starts/ends observed; PM9 identity observed and virtual identity not applicable; affected location unknown for Time Anomaly, independently of later Mapping choices. |
| Null time parse failure | 동일 timestamp 다중 경계, Time Anomaly(EndBeforeStart, sequence/timestamp 역전), 시각 null 경계 | `occ-null-time` | Start unknown with null time; end observed; material location/identity not applicable, activity timing unknown rather than filled. |
| Same timestamp, distinct sequences | 동일 timestamp 다중 경계, Time Anomaly(EndBeforeStart, sequence/timestamp 역전), 시각 null 경계 | `occ-lla-arrival`, `occ-tm-out` | Visit end and transfer start observed at the same time with different sequences; identity observed; location changes from observed rest to derived Handler, ordered by sequence. |
| UnmatchedEnd without Occurrence | Data Quality Issue 표시(상태 불변), 미매핑 alias, Binding 경계를 넘는 재생 구간 | `dqi-unmatched-end` | Unknown timeline marker only; no location, identity, start or end state is fabricated, and no related Occurrence exists. |
| Linked EndBeforeStart issue | Data Quality Issue 표시(상태 불변), 미매핑 alias, Binding 경계를 넘는 재생 구간 | `dqi-end-before-start`, `occ-time-anomaly` | Unknown issue marker linked to anomaly; state unchanged by DQI. Raw occurrence identity/start/end observed; affected location unknown because of Time Anomaly. |
| Binding switch crossed | Data Quality Issue 표시(상태 불변), 미매핑 alias, Binding 경계를 넘는 재생 구간 | `occ-tm-out` | Handler location derived before switch, unknown immediately after; identity and both source boundaries observed. No old layout location carried into new Binding. |
| Unmapped alias | Data Quality Issue 표시(상태 불변), 미매핑 alias, Binding 경계를 넘는 재생 구간 | `occ-unmapped` | Location unknown for PM9 until mapped; identity observed; start and end observed. |
| Intentionally ignored virtual alias | Data Quality Issue 표시(상태 불변), 미매핑 alias, Binding 경계를 넘는 재생 구간 | `occ-ignored` | No displayed physical/material location or identity (not applicable); start and end observed. Intended ignored status is documented, not encoded in this Occurrence DTO, and differs from unmapped unknown. |

Schema validation deliberately transcribes the DTO without pairing, chronology, mapping or occupancy refinements. The case tests pin these relationships in this fixture, not additional acceptance rules for every source batch. Full replay controls, permissions, caps and cache behavior from the remaining matrix bullets require later implementations.

## #9b answer-key files

- `onboarding/alias-metadata.json`: synthetic adapter metadata for #11; explicit ModuleType, Port and Robot flags, supplied separately from OccurrenceBatch.
- `onboarding/scopes/model/synth-maker/synth-model/type-dictionary.json`: synthetic model-scope Type Dictionary for #11; SYN_VIRTUAL deliberately has no Role entry.

- `layout.json`: eight Components using the primitive catalog (`primitive:*` assetRefs, illustrative symbols), explicit ports, Physical Interfaces, Transfer Capabilities and one Process Route. All geometry/connectivity provenance is synthetic and assumed; no arm count or kinematics is claimed. The LP carrier site exists but the carrier Occurrence supplies no slot, so its mapped Location remains Component-level.
- `onboarding/scopes/model/synth-maker/synth-model/alias-rules.json`: verified model rules, slot-free `PM{n}` pattern and exact PM2 station map. PM1 has no station-2, so a shared two-station pattern would be invalid. PM9 has no target Component and stays unmapped. EFEM has no SlotMap, so no blade is inferred.
- `onboarding/scopes/equipment/eq-synth-01/alias-rules.json`: one PM2 exception with the same stations and assumed certainty.
- `onboarding/mappings/eq-synth-01/30d2c1a312841e4cfb9d293107651d4125c0ea37806e473e564b03ff52bf8ca2.mapping.json`: v1, published from the model file alone.
- `onboarding/mappings/eq-synth-01/0abf3e9ff0b22cb0e7993bfe143461f44ef1b8828df2cdce8e25af3d02987aef.mapping.json`: v2, published from model and equipment files. Both filenames are the canonical SHA-256 hash without `sha256:`; the full hash is in each document.
- `onboarding/bindings/eq-synth-01.bindings.json`: v1 `[09:00:00, T_BIND)`, v2 `[T_BIND, open)` on eq-synth-01-layout.
- `expected-inventory.json`: hand-counted over all 29 Occurrences, eight aliases and six directed transfer pairs (seven transfers). Each alias reference counts once per Occurrence; boundaries outside the query window are retained. ModuleType/Port/Robot metadata is absent because the batch cannot supply it. Role is not a DTO field.
- `expected-scene-states.json`: sixteen static answers using the nine numbered rules in [Scene State 계약 (#9b)](../../docs/REPLAY-CONTRACT.md#scene-state-계약-9b). These are fixtures for #10, not reducer output. Each lists all eight bound Components in code-unit order; unlisted activities below mean `no recorded activity`/`unknown`/`[]`.

## Per-time rationale

All rows use the date `2026-01-01` and millisecond precision `.000`; O/D/U below mean observed/derived/unknown location evidence. Identity and boundary evidence are independent. The carrier starts before the Binding switch and remains unresolved afterward until its end removes it. Identified materials use `m:<kind>:<id>` keys; anonymous materials use `o:<occurrenceId>`. The disjoint prefixes prevent collisions even when a raw id is `occ:anonymous`, and kind separates a wafer from a carrier with the same id. Raw source ids are preserved, and materials and conflict keys use code-unit ordering. Every applied end removes its placement, even without a following placement. DQIs remain timeline-only.

| t | Rules exercised | Notable expected values |
| --- | --- | --- |
| 10:00:30 | 1–5; mid-entry | seq 3, v1: C01 lp-a O, W01 lp-a/slot-1 O, W02 lp-a/slot-2 O. Carrier site is not inferred. |
| 10:03:30 | 1–5; Handler SlotMap | seq 9, v1: C01 lp-a O, W01 tm-robot/blade-a D, W02 lp-a/slot-2 O. |
| 10:04:15 | 2–5; concurrent Handlers | seq 11, v1: W01 tm-robot/blade-a D, W02 efem-robot D without a site; C01 lp-a O. |
| 10:05:30 | 3–5; Binding reset | seq 14, v2: C01 and W01 null/U (no unmapped marker); W02 ll-a/slot-2 O; W03 tm-robot/blade-b D. |
| 10:08:30 | 2, 5, 6, 8; assumed cap, distinct sites | seq 20: C01 null/U; W01 pm-a O; W04 pm-b/station-1 D; W05 pm-b/station-2 D. pm-a processing/O; pm-b processing/D with both activity ids, no conflict. |
| 10:13:30 | 2, 5, 6; forced end facet | seq 31: C01 null/U, W01 lp-a/slot-1 O; pm-a post-processing/O. Its future forced end does not lower start/activity. |
| 10:14:30 | 2, 6; fallback start facet | seq 33: same C01/W01; pm-a function/D from fallback start. |
| 10:15:30 | 3, 5; synthetic relocation | seq 35: same C01/W01 plus W06 tm-robot/blade-a D; W06 identity remains observed. |
| 10:16:30 | 2, 5; Inferred identity | seq 37: same C01/W01 plus W06 pm-b/station-1 D; W06 identity is derived independently. |
| 10:18:30 | 2, 3, 5; anonymous occupancy | seq 41: same C01/W01 plus anonymous material under an `o:<occurrenceId>` key at pm-b/station-2 D; id null, identity unknown. |
| 10:19:30 | 1, 2, 7; whole-record anomaly window | seq 42 stops before seq 43 at 10:20. Only C01 null/U and W01 lp-a/slot-1 O remain; time-anomaly marker for the EndBeforeStart owner despite its start being outside the prefix. |
| 10:20:30 | 1, 6; null-time start | seq 46 includes null-time FUNCTION and DQI. Same C01/W01; pm-b function/U. DQI contributes no Scene marker. |
| 10:22:45 | 1, 7, 8; conflict and ignored anomaly owner | seq 49: same C01/W01 plus W08/W09 ll-a/slot-1 U. One occupancy marker with both keys; one time-anomaly marker for PM9's owner. Ignoring VIRT_SCH removes only its marker, preserving the inversion window [10:22:30, 10:23:00]. |
| 10:23:30 | 2, 4, 7; unmapped | seq 52: C01 null/U, W01 lp-a/slot-1 O, W09 ll-a/slot-1 O, W10 null/U. One PM9 unmapped-alias marker; no anomaly or ignored marker. |
| 10:24:30 | 2, 5, 6; ends remove placements | seq 58: only W11 pm-b/station-1 D; pm-b processing/D. No stale carrier, returned wafer or conflict placements. |
| 10:26:00 | 9; after Watermark | seq 59: W11 pm-b/station-1 U, pm-b processing/U, after-watermark marker. W11 identity stays observed; all inactive Components remain unknown. |
