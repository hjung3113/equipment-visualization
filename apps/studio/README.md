# @eqv/studio

Standalone Studio app: shell and router (`/fleet`, `/fleet/new` (설비 등록), `/equipment/:equipmentId` (설비 데이터: record, Sample Windows, alias metadata and Type Dictionary status, import status notices), `/layouts`, `/onboarding/:equipmentId`, `/onboarding/:equipmentId/board`, `/focus/:equipmentId`, `/journey/:equipmentId`; `/onboarding/:equipmentId`, `/onboarding/:equipmentId/board`, `/focus/:equipmentId` and `/journey/:equipmentId` take `?window=<hex>` to open one Sample Window; Onboarding has a Sample Window picker, and the window it shows feeds the Inventory, the Template proposals, the Mapping Board and the Publish Baseline Inventory), a layouts page
(viewer, geometry editing, import/export, draft save, Layout Revision publish) and a **dev-only** file API. Layout Revision publish opens a change preview first: it compares the document with the revision a Binding pins for that layout (the only existing revision when there is just one) at id level, says so when the same content is already published or when it is the first revision, and shows no comparison when several revisions exist and none is pinned; `게시` in the dialog writes the revision. Fleet and Onboarding (read-only
Inventory and Template proposals, #14a) and the Mapping Board (#14b) are implemented. `/dev/ui` is a dev-only `@eqv/ui` component gallery for design review. It is not in the nav, it is absent from `vite build` output, and the data is synthetic.

Focus (`/focus/:equipmentId?entityType=&anchor=`, #15c) is the first analysis mode: a Top View with the cursor-time replay
layer, a text equivalent of that layer, a Component-lane Gantt and Occurrence list / Data Quality / evidence detail tabs, all
sharing one page-local cursor. `anchor` is read as an Occurrence id (`entityType` is shown, not interpreted); the default range
is that Occurrence widened by a margin, or the whole batch with a notice. Focus replays one Sample Window, chosen with a picker
(`?window=`); without `?window=` it is the latest-`from` window containing the anchor Occurrence (a notice when several do), else the
latest window, and an unknown `?window=` is an error, never a fallback. The Gantt is bounded twice. It is computed only up to `TIMELINE_BUDGET`
(`src/focus-data.ts`, 4,800,000 of records + breakpoints × (Binding/Layout search and component build + (most Occurrences open at once + Time Anomaly inversions) × one location resolution), about 1 s at the worst measured rate), and drawn only up to `GANTT_SPAN_LIMIT` (5,000 spans: material and activity spans plus markers, about 100 ms to repaint; a whole 50k-Occurrence window has 100,000); above it a notice asks
for a narrower range, and the Top View, state list, Occurrence list, Data Quality and evidence detail stay. `loadFocus` (`src/focus-data.ts`) reads and checks
the batch, every Mapping Version a Binding names and each Binding's Layout (its published Layout Revision, else the draft with
a notice); it never rejects. Playback (#15d) moves only the cursor: play/pause, speed x0.25–x4 (screen time), previous/next breakpoint, and a debug
Sequence step that shows the state after a chosen Record Sequence instead of the cursor's seek. `예시 이동 표시` (off by default,
page-local) adds badged example-motion ghosts between two observed boundaries of an open TRANSFER; they are never log evidence.

Journey (`/journey/:equipmentId?anchor=&window=`, #152) follows one wafer through one Sample Window. `anchor` is an Occurrence id
whose material is a wafer with an id; Focus links to it (`Journey 열기`) from a selected wafer. The window is chosen as in Focus and
loaded with the same `loadFocus`. The Top View shows the Layout the anchor's Binding names, with the wafer's hops as numbered badges
(`docs/VIEWS.md` §Journey: discrete hops, no path or animation), and two tabs: `물리 경유` (the hop list, each hop with a Focus link)
and `실행 이력` (PROCESS, POST_PROCESS and FUNCTION rows, including rows without a location).

An imported document is unsaved until its draft is saved. While it is unsaved, opening another file or leaving the
page through Studio navigation or browser back/forward asks before discarding it. Reloading or closing the tab uses
the browser's own leave-page prompt. Draft save proceeds without a discard prompt; choosing another import replaces
the current import without asking.

Editing (#158, #166): on `/layouts` any opened document (template, draft, revision or import) can be refined in place. Drag a Component on
the Top View, or select it and use `Alt`+arrow keys (1 layout unit, `Shift` 10×) and `[` / `]` (15° left / right); the `선택 항목`
panel shows its ID, Role and parent and edits the name and `X`, `Y` and `회전 (°)` as exact values (Enter or blur commits, Escape restores,
a non-number is refused). X and Y of a child are in its parent's frame. `격자 맞춤` (off by default) snaps drags and key moves to a
grid of 10 and rotations to 15°; typed values are never snapped. `실행 취소` / `다시 실행` (⌘/Ctrl+Z, ⇧⌘/Ctrl+Z or Ctrl+Y) step
through the edit history, and a drag is one step. Move and rotate change only `transform` (and mark verified transform provenance `assumed`), never ports, connectivity, `unit` or `viewBox`. Label edits trim whitespace and mark verified label provenance `assumed`.
For equipment layouts, select one of 25 catalog primitives and use `Component 추가` to add it at the viewBox centre, on the selected Component’s level (otherwise the lowest-order level), with snap if enabled. A new Component is sized to the median footprint (longer side, including each Component’s own scale) of the existing ones, preserving the primitive’s aspect ratio. Adding never creates connectivity; new fields are assumed and size certainty stays unknown. `삭제` or Delete/Backspace opens a counted confirmation; it removes the Component and its graph references in one undoable step. Parents with children and the last Component cannot be deleted. Templates allow move, rotate and label edits but disable add/delete to preserve role cardinality. The delete dialog freezes edits, save and publish, and closes without deleting when the document changes. Unsaved edits are guarded like an unsaved import (navigation confirm, browser
leave-page prompt, `저장 안 됨` badge). `초안 저장` writes the edited document to `layouts/<id>/draft.layout.json`; export and the
publish change preview use the edited document too, so the preview lists added, removed and changed Components. Resize, port snapping and
multi-select are not implemented.
For a selected Component, four sections list Physical Interfaces, Ports, Holding Sites and Transfer Capabilities and allow explicit additions and deletions (#167, #168), including on Templates (Ports are added through a Physical Interface); new items are assumed with no source evidence, and partner Components and robot Handlers are chosen explicitly. Deleting a Port also removes its Physical Interfaces, and deleting a Holding Site removes its Transfer Capabilities; each add or delete is immediate, without confirmation, and is one undo step.

The equipment data page imports Sample Windows, alias metadata and the Model Type Dictionary through `/api/import/*`. Each file is checked in the browser first for size and JSON syntax, then with the same `@eqv/core` validators (including `validateSampleWindow`); the server makes the final decision. Rejections list their code and path, and imported values are never fixed. Replacing alias metadata requires confirmation and shows added, removed and changed aliases. The Model Type Dictionary is create-only, and results appear as toasts.

## Demo equipment

`eq-demo-01` (maker `synth-maker`, model `synth-demo`) is a generated, fully published synthetic equipment for demos: the `cluster-single` Layout pinned as a Layout Revision, a Mapping Version, a baseline Inventory, Bindings and two adjacent Sample Windows (2026-01-02 08:00–10:00 and 10:00–12:00), each replaying one 25-wafer lot through carrier, EFEM robot (both blades), aligner, load locks, TM robot and four process chambers. Two things are deliberately imperfect: `PM5` has no Alias Rule (unmapped alias) and each window has one `UnmatchedEnd` Data Quality Issue. The wafers' final load-port visits and the carrier stay source-open past the Watermark. The unchanged `cluster-single` template declares no Transfer Capability for the EFEM-side hops the scenario observes (load port → aligner, aligner → load lock, load lock → load port), so the Board dry-run lists five `transfer-without-capability` conflicts per window; they are expected, and no capability is invented to hide them (geometry never establishes connectivity). Regenerate the files with `pnpm --filter @eqv/studio demo:generate` (it rewrites `assets/`); `test/demo-assets.test.ts` checks that the committed files equal the generator output.

## Styling

Studio uses Tailwind v4 (`@tailwindcss/vite`) and the `@fops/ui` theme from the `external/feedbackops` submodule (ADR-0008). The `@import` order at the top of `src/studio.css` (tailwindcss, tokens and semantic in `layer(base)`, theme, compat) is an invariant; `test/theme-tokens.test.ts` pins it. The `--eqv-*` rows in `:root` are declared only where `@fops/ui` defines the platform token, wrapped as `rgb(var(--token))`; every other `--eqv-*` row stays undeclared so the asset fallback hex applies.

## Run

```sh
pnpm dev                              # from the repo root: builds core and renderer, then starts vite
pnpm dev --port 5181 --strictPort     # extra args reach vite
```

The data root is `<repo>/assets` by default. Set `EQV_STUDIO_ASSETS` to an absolute path to use another root (previews, tests,
your own equipment). Import (`/api/import/*`) writes only to a root **outside this repository**: when the root's realpath is
inside the repo, every import write is 403 (`저장소 밖 경로를 EQV_STUDIO_ASSETS로 지정하세요`) and `GET /api/import/status`
reports `enabled: false` with that reason. A root inside another git work tree is allowed, and the status reports
`insideGitWorkTree: true` so the UI can warn. Reads and the general file API are not affected.
It exists only in `vite` serve mode (`apply: 'serve'`); `vite build` output has no server code. There is no auth and no
permission check (ONBOARDING §8).

## Start with your own equipment

Start Studio from the repository root with a writable absolute data root outside this repository:

```sh
EQV_STUDIO_ASSETS=/abs/path pnpm dev
```

Without `EQV_STUDIO_ASSETS`, Studio uses `<repo>/assets` and disables imports. The status notice says `가져오기를 쓸 수 없습니다`
and gives the reason `저장소 밖 경로를 EQV_STUDIO_ASSETS로 지정하세요`; `GET /api/import/status` reports `enabled: false`.

Follow this order:

1. **Register** — In Fleet, open `/fleet/new` (**설비 등록**), enter `설비 ID`, `Maker`, and `Model`, then choose **등록**.
   This creates `equipment/<equipmentId>.json` once.
2. **Model Type Dictionary** — On **설비 데이터**, choose **Type Dictionary(Model 범위)**, select the dictionary JSON,
   review it, and choose **가져오기**. This creates `onboarding/scopes/model/<maker>/<model>/type-dictionary.json` once.
3. **Alias metadata** — On **설비 데이터**, choose **Alias metadata**, review the preview, then choose **가져오기**.
   This writes `observations/<equipmentId>/alias-metadata.json`; replacement shows the added/removed/changed aliases and requires **교체**.
4. **Sample Window** — Choose **Sample Window 가져오기**, review one complete `OccurrenceBatch`, then choose **가져오기**.
   Studio appends `observations/<equipmentId>/windows/<from>_<to>_<hex>.batch.json` with its name computed by the server.
5. **Onboarding and Board** — Open **Onboarding**, choose a window with **사용할 window**, and start from a proposal with
   **이 템플릿으로 시작** or **Generic Layout으로 시작**. This creates `layouts/<layoutId>/draft.layout.json` only when absent
   (`<layoutId>` is `<equipmentId>-layout` for a new equipment record) and opens the Board. If a draft already exists, use
   **④ Mapping Board 열기**. On the Board, **저장** persists changed Model and/or Equipment rules to
   `onboarding/scopes/model/<maker>/<model>/alias-rules.json` and `onboarding/scopes/equipment/<equipmentId>/alias-rules.json`.
6. **Publish** — After `⑤ 검증 (dry-run)` completes, set `effectiveFrom` in `⑥ Publish` and choose **게시**. Publish writes
   `layouts/<layoutId>/<hex>.layout.json`, `onboarding/mappings/<equipmentId>/<hex>.mapping.json`,
   `onboarding/baselines/<equipmentId>/<hex>.inventory.json`, and `onboarding/bindings/<equipmentId>.bindings.json`.
7. **Focus** — Open **Focus** and choose the same window with **사용할 window** if needed. Focus reads one Sample Window and
   writes no files.

### What gets rejected and why

- Equipment identifiers, makers, and models must match `[A-Za-z0-9][A-Za-z0-9._-]*`; a case-only collision for an
  `equipmentId`, `maker`, or same-maker `model` is rejected. Equipment registration and the Model Type Dictionary import
  are create-only (an existing path returns 412).
- Sample Windows are immutable. A different window that overlaps an existing window is rejected as `window-overlap`;
  `time-domain-mismatch` rejects a different `timeDomain`. Identical content is idempotent.
- Import only accepts a complete `OccurrenceBatch`: `continuationToken` is rejected with `continuation`. Raw logs and
  Start/End point events are not OccurrenceBatches and fail with `schema`.
- Site Wall-clock requires exactly three fractional digits; values are never truncated. Inputs with more than three digits,
  including sub-millisecond precision, are rejected as `fraction-too-long` (ADR-0009 also defines `fraction-missing`, `offset`, and `malformed-time`).
- Other `validateSampleWindow` rejection codes are `empty-range`, `empty-time-domain`, `equipment-mismatch`, `record-owner`,
  `duplicate-seq`, `duplicate-id`, `generation-mismatch`, and `outside-window`. The preview shows each code and path.
- Import bodies over 32 MiB return 413. See [ADR-0009](../../docs/adr/0009-site-wall-clock-millisecond-precision.md) and
  [ADR-0010](../../docs/adr/0010-studio-data-import.md) for the decisions.

### Keep source converters outside this repository

Studio accepts only source-paired `OccurrenceBatch` JSON. Put raw-log conversion in a separate, permissioned deployment layer;
keep examples and tests synthetic, as required by [AGENTS.md: “Use synthetic test data”](../../AGENTS.md).

Try the synthetic files in [`fixtures/import/README.md`](../../fixtures/import/README.md):
`eq-synth-03.equipment.json`, `synth-maker-b.synth-wet.type-dictionary.json`, `eq-synth-03.alias-metadata.json`,
`eq-synth-03.w1.batch.json`, and `eq-synth-03.w2.batch.json`. Negative examples are
`invalid/sub-ms.batch.json`, `invalid/continuation.batch.json`, and `invalid/point-events.json`.
See the [File API](#file-api) table for the endpoint contract.

## File API

| Request | Result |
| --- | --- |
| `GET /api/files?path=<rel>` | parsed JSON; 404 if missing |
| `GET /api/files?dir=<rel>` (`dir=` is the root) | `{ entries: [{ name, kind }] }`: directories and `.json` files, code-unit order |
| `PUT /api/files?path=<rel>` (JSON body) | 201 `{ path, created: true }`; 200 `{ path, created: false }` on overwrite or an identical immutable file; 409 if a different immutable file exists |
| `PUT /api/files?path=<rel>` with `If-None-Match: *` | create-only for a mutable path: validated as usual, then created exclusively (201); 412 `{ error }` and the file untouched if it already exists. Without the header a mutable file is overwritten |
| `POST /api/layout-revisions` (layout JSON) | 201 `{ path, revision }`; 200 if identical; 409 if a different file is at that path |
| `GET /api/import/status` | `{ enabled, reason?, insideGitWorkTree, catalog: 'data-root' \| 'bundled', maxWindowBytes }` |
| `POST /api/import/equipment` (`equipmentRecordSchema`) | 201 `{ path, created: true }`; 412 if the id exists; 409 `{ error, field, existing }` for an id, maker or model that differs only by case from a stored one |
| `POST /api/import/windows?equipmentId=<id>` (a complete `OccurrenceBatch`) | 201 `{ path, created: true, summary, warnings }`, the file named by the server; 200 `created: false` for an identical file; 400 `{ error, issues, warnings, summary? }` with `validateSampleWindow` reject codes; 409 for overlap/time-domain only, or a different file at the same name; 404 equipment not registered |
| `PUT /api/import/alias-metadata?equipmentId=<id>` (`aliasMetadataFileSchema`) | 201 on create, 200 on replace; with `If-None-Match: *` 412 if it exists |
| `PUT /api/import/type-dictionary?maker=<m>&model=<n>` (Model-scope dictionary) | 201, create-only (412 if it exists); 404 unless a registered record has exactly that maker and model |

Import bodies may be up to 32 MiB (413 above); every other endpoint keeps 5 MiB. An import checks, in order: guard (403), query names (400), content type (415), size (413), JSON (400), body validation and registry (400/404/409/422), then writes. A failed request writes nothing.

PUT and POST need `Content-Type: application/json` (415 otherwise). Reads cover any `.json` under the root. Unsafe paths
(`..`, absolute, `\`, NUL, `:` in the first segment, empty or `.` segments) get 400; symlink escapes get 403.

## Write patterns

Only these paths are writable, and each must pass the named core validator (failure: 400 with `issues`). Anything else: 403.
`<layoutId>` follows the id pattern; `<maker>`, `<model>`, `<equipmentId>` match `[A-Za-z0-9][A-Za-z0-9._-]*`; `<hex>` is 64 lowercase hex.

| Path | Check | Mutability |
| --- | --- | --- |
| `layouts/<layoutId>/draft.layout.json` | `validateLayout`, `id === <layoutId>` | overwrite |
| `layouts/<layoutId>/<hex>.layout.json` | written only by `POST /api/layout-revisions`; `<hex>` = `layoutRevision` (the Replay Key `layoutHash` without `sha256:`) | immutable |
| `onboarding/scopes/global/type-dictionary.json` | `validateTypeDictionary`, global scope | overwrite |
| `onboarding/scopes/maker/<maker>/{type-dictionary,alias-rules}.json` | matching validator, maker scope | overwrite |
| `onboarding/scopes/model/<maker>/<model>/{type-dictionary,alias-rules}.json` | matching validator, model scope | overwrite |
| `onboarding/scopes/equipment/<equipmentId>/alias-rules.json` | `validateAliasRules`, equipment scope | overwrite |
| `onboarding/mappings/<equipmentId>/<hex>.mapping.json` | `mappingVersionSchema`, `verifyMappingHash`, `hash === sha256:<hex>`, `equipmentId` | immutable |
| `onboarding/baselines/<equipmentId>/<hex>.inventory.json` | `observedInventorySchema`, `equipmentId`, matching Mapping Version exists (else 409) | immutable |
| `onboarding/bindings/<equipmentId>.bindings.json` | `validateBindings`, `equipmentId` | overwrite |

### Import-only paths

Written only through `/api/import/*`; the general `PUT /api/files` gets 403 for `equipment/` and `observations/`. Existing Model `type-dictionary.json` files can still be overwritten through the general API.

| Path | Check | Mutability |
| --- | --- | --- |
| `equipment/<equipmentId>.json` | `equipmentRecordSchema`; ids, makers and models that differ only by case are refused | create-only |
| `observations/<equipmentId>/windows/<from>_<to>_<hex>.batch.json` | `validateSampleWindow`; equipment registered; name computed by the server | immutable, append-only |
| `observations/<equipmentId>/alias-metadata.json` | `aliasMetadataFileSchema`, `equipmentId` equals the query | create or replace |
| `onboarding/scopes/model/<maker>/<model>/type-dictionary.json` | `validateTypeDictionary`, Model scope; a registered record has that maker/model | create-only through import |

`templates/` and `primitives/` are read-only (writes get 403); when the data root has no `templates/`, reads under it come from the bundled `<repo>/assets/templates/` (the status says `catalog: 'bundled'`). `equipment/` and `observations/` are written only through `/api/import/*`. Fleet and Onboarding read `equipment/<equipmentId>.json`, `observations/<equipmentId>/alias-metadata.json` and the `onboarding/` files above, and validate each at read time; the Studio reads `observations/<equipmentId>/windows/*.batch.json` (one selected Sample Window). Files are written as received (`JSON.stringify(value, null, 2)` plus a newline); mutable files are replaced atomically.

## Mapping Board (#14b)

`/onboarding/:equipmentId/board` is step ④ of the Onboarding flow. It reads, through the same loader as the Onboarding page:
the equipment record, its observations and the `onboarding/` files above (including the maker, model and equipment `alias-rules.json`
when present), `templates/`, and the layout draft `layouts/<layoutId>/draft.layout.json`. `<layoutId>` is the latest binding's
`layoutId` once published, otherwise `<equipmentId>-layout`. A missing draft (404) is "no draft"; a draft that is invalid, not an
`equipment-layout`, or whose `id` differs from `<layoutId>` is a data error and is never replaced.

The Board writes only:

- the Model and Equipment scope files `onboarding/scopes/model/<maker>/<model>/alias-rules.json` and
  `onboarding/scopes/equipment/<equipmentId>/alias-rules.json`, and only on `[저장]` (equipment is written first, then model, stopping at the first failure);
- through "이 템플릿으로 시작" / "Generic Layout으로 시작" on the Onboarding page, `layouts/<layoutId>/draft.layout.json`, **only when absent**
  (`If-None-Match: *`; an existing draft answers 412 and is left alone).

It never writes a Mapping Version or a binding, so published mappings are unchanged (ADR-0005). Unsaved edits ask before Studio
navigation leaves the page, and the browser prompts on reload or close.

## Validate and Publish (#14d)

Above the Mapping Board, the page shows steps ⑤ and ⑥ (ADR-0007).

- **⑤ 검증 (dry-run):** `publishMapping` over the **saved** rule files (the files the Board wrote, not unsaved edits) and the layout draft, then coverage and
  Mapping Conflicts over the loaded sample Inventory. Nothing is written and no reducer runs. A conflict button rings its components in the Board's Top View;
  a transfer conflict also draws a dashed line titled `관측 이송 <from> → <to> <count>건 (Transfer Capability 없음)`.
- **⑥ Publish:** an `effectiveFrom` input (prefilled with the Inventory `from`, or `to` when bindings exist), the diff against the latest Mapping Version,
  and `[게시]`. If that default is not later than the latest binding, the field starts empty with a hint and becomes an error only after typing. Date edits reuse the computed dry-run and revision, keeping the diff visible. It is disabled while the Board has unsaved edits, when `publishMapping` reports issues, when `effectiveFrom` is invalid, or when nothing changed.
- **Write order** (the failed step is shown; a retry is idempotent): `POST /api/layout-revisions` with the draft; the Mapping Version
  `onboarding/mappings/<equipmentId>/<hex>.mapping.json`; the Baseline Inventory `onboarding/baselines/<equipmentId>/<mappingHex>.inventory.json`
  (requires the matching Mapping Version file; a baseline-content 409 keeps the existing baseline); then the bindings file, which is the commit point. While it runs, and while the page reloads after it, the Board is inert.
- **같은 Model 일괄 dry-run:** loads every equipment with the same maker/model and computes each row from its own loaded Inventory, draft and saved rule files. Error rows show status `—`; listed equipment whose maker/model cannot be read stay outside the table and are counted in its caption as `읽지 못한 설비 N대`.
