# @eqv/studio

Standalone Studio app: shell and router (`/fleet`, `/layouts`, `/onboarding/:equipmentId`, `/onboarding/:equipmentId/board`, `/focus/:equipmentId`), a layouts page
(viewer, import/export, draft save, Layout Revision publish) and a **dev-only** file API. Fleet and Onboarding (read-only
Inventory and Template proposals, #14a) and the Mapping Board (#14b) are implemented.

Focus (`/focus/:equipmentId?entityType=&anchor=`, #15c) is the first analysis mode: a Top View with the cursor-time replay
layer, a text equivalent of that layer, a Component-lane Gantt and Occurrence list / Data Quality / evidence detail tabs, all
sharing one page-local cursor. `anchor` is read as an Occurrence id (`entityType` is shown, not interpreted); the default range
is that Occurrence widened by a margin, or the whole batch with a notice. `loadFocus` (`src/focus-data.ts`) reads and checks
the batch, every Mapping Version a Binding names and each Binding's Layout (its published Layout Revision, else the draft with
a notice); it never rejects. Playback (#15d) moves only the cursor: play/pause, speed x0.25–x4 (screen time), previous/next breakpoint, and a debug
Sequence step that shows the state after a chosen Record Sequence instead of the cursor's seek. `예시 이동 표시` (off by default,
page-local) adds badged example-motion ghosts between two observed boundaries of an open TRANSFER; they are never log evidence.

An imported document is unsaved until its draft is saved. While it is unsaved, opening another file or leaving the
page through Studio navigation or browser back/forward asks before discarding it. Reloading or closing the tab uses
the browser's own leave-page prompt. Draft save proceeds without a discard prompt; choosing another import replaces
the current import without asking.

## Run

```sh
pnpm dev                              # from the repo root: builds core and renderer, then starts vite
pnpm dev --port 5181 --strictPort     # extra args reach vite
```

The file API reads `<repo>/assets`. Set `EQV_STUDIO_ASSETS` to an absolute path to use another root (previews, tests).
It exists only in `vite` serve mode (`apply: 'serve'`); `vite build` output has no server code. There is no auth and no
permission check (ONBOARDING §8).

## File API

| Request | Result |
| --- | --- |
| `GET /api/files?path=<rel>` | parsed JSON; 404 if missing |
| `GET /api/files?dir=<rel>` (`dir=` is the root) | `{ entries: [{ name, kind }] }`: directories and `.json` files, code-unit order |
| `PUT /api/files?path=<rel>` (JSON body) | 201 `{ path, created: true }`; 200 `{ path, created: false }` on overwrite or an identical immutable file; 409 if a different immutable file exists |
| `PUT /api/files?path=<rel>` with `If-None-Match: *` | create-only for a mutable path: validated as usual, then created exclusively (201); 412 `{ error }` and the file untouched if it already exists. Without the header a mutable file is overwritten |
| `POST /api/layout-revisions` (layout JSON) | 201 `{ path, revision }`; 200 if identical; 409 if a different file is at that path |

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

`templates/`, `primitives/`, `equipment/` and `observations/` are read-only (writes get 403). Fleet and Onboarding read `equipment/<equipmentId>.json`, `observations/<equipmentId>/{occurrence-batch,alias-metadata}.json` and the `onboarding/` files above, and validate each at read time. Files are written as received (`JSON.stringify(value, null, 2)` plus a newline); mutable files are replaced atomically.

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
