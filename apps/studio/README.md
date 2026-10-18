# @eqv/studio

Standalone Studio app: shell and router (`/fleet`, `/fleet/new` (설비 등록), `/equipment/:equipmentId` (설비 데이터: record, Sample Windows, alias metadata and Type Dictionary status, import status notices), `/layouts`, `/onboarding/:equipmentId`, `/onboarding/:equipmentId/board`, `/focus/:equipmentId`; `/onboarding/:equipmentId` and `/focus/:equipmentId` take `?window=<hex>` to open one Sample Window), a layouts page
(viewer, import/export, draft save, Layout Revision publish) and a **dev-only** file API. Fleet and Onboarding (read-only
Inventory and Template proposals, #14a) and the Mapping Board (#14b) are implemented. `/dev/ui` is a dev-only `@eqv/ui` component gallery for design review. It is not in the nav, it is absent from `vite build` output, and the data is synthetic.

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
