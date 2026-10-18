# Synthetic import fixtures for `eq-synth-03`

These hand-written fixtures are synthetic scenario data. They are not OEM data, measured equipment geometry, or excerpts from real logs. Alias names and the documented roles describe this test scenario; they are not Mapping data. The fixtures contain no illustrative evidence.

## Files

| File | Purpose |
| --- | --- |
| `eq-synth-03.equipment.json` | Synthetic equipment identity for the `synth-maker-b` / `synth-wet` model scope. |
| `synth-maker-b.synth-wet.type-dictionary.json` | Maps the six generic `SYN_*` ModuleTypes to the wet-linear roles. |
| `eq-synth-03.alias-metadata.json` | Adapter metadata for all 12 equipment aliases, including `WC4`, which is absent from w1 observations. |
| `eq-synth-03.w1.batch.json` | First complete Sample Window and its evidence examples. |
| `eq-synth-03.w2.batch.json` | Adjacent complete Sample Window with one new cell alias and one new slot. |
| `invalid/sub-ms.batch.json` | Complete batch with one boundary containing unsupported sub-millisecond precision. |
| `invalid/continuation.batch.json` | Schema-valid batch that is incomplete because it has a continuation token. |
| `invalid/point-events.json` | Start/End point-event input, which is not an OccurrenceBatch. |

## Windows and special records

- **w1:** `[2026-01-01T10:00:00.000, 2026-01-01T10:30:00.000)`.
- **w2:** `[2026-01-01T10:30:00.000, 2026-01-01T11:00:00.000)`.
- Windows are adjacent, separately exported OccurrenceBatches and are never merged. The carrier `occ-carrier-window-boundary` is open in w1 because its end was not confirmed at that export. In w2 it is closed, with the same `id` and identical `start`; its end has a later Record Sequence.
- `occ-w1-wc3-null-time` has the sole `at: null` boundary, labelled `unknown` with `TimeParseFailure`.
- `occ-w1-wc2-forced` has the sole forced end: `ForcedByNextStart`, with `derived` evidence on that end boundary.
- `occ-w1-lp2-inferred` is the sole non-null material identity marked `derived`.
- `occ-w1-wc1-inverted` has `end.at < start.at` while its end Record Sequence is greater than its start Record Sequence.
- The w1 Data Quality Issues are `dqi-w1-unmatched-end` (`UnmatchedEnd`, unlinked) and `dqi-w1-end-before-start` (`EndBeforeStart`, linked to `occ-w1-wc1-inverted`).
- `occ-w2-buffer-slot-nine` adds slot `9` to the existing alias `BUF1`; the new cell alias `WC4` is observed at slot `1` in `occ-w2-wc4-transfer`.

The six generic dictionary entries are `SYN_LOADPORT → lp`, `SYN_RAIL → rail`, `SYN_WET_ROBOT → robot`, `SYN_WET_CELL → cell`, `SYN_DRYER → dry`, and `SYN_BUFFER → buffer`. Metadata marks only `LP1`–`LP3` as ports and only `WR1` as a robot.

## Expected later-issue results

- **w1 counts:** 2 DQIs, 1 open Occurrence, and 1 `at: null` boundary. Its Inventory has 11 aliases and does not include `WC4`.
- **Template proposal for w1:** `wet-linear`, rank 1, `rolesOutOfRange: 0`.
- **Template proposal for w2:** `wet-linear`, rank 1, `rolesOutOfRange: 1`. The `cell` row is `{ observed: 4, drawn: 3, min: 3, max: 3, inRange: false }`; every other role row is in range.
- **Drift from w1 to w2:**

  ```json
  {
    "newAliases": ["WC4"],
    "newSlots": [
      { "alias": "BUF1", "slot": "9" },
      { "alias": "WC4", "slot": "1" }
    ],
    "transfersWithoutCapability": []
  }
  ```

- **Expected #97 rejection codes:** `invalid/sub-ms.batch.json` → `fraction-too-long`; `invalid/continuation.batch.json` → `continuation`; `invalid/point-events.json` → `schema`.
