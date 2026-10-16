# @eqv/studio

Standalone Studio app: shell and router (`/fleet`, `/layouts`, `/onboarding/:equipmentId`, `/focus/:equipmentId`), a layouts page
(viewer, import/export, draft save, Layout Revision publish) and a **dev-only** file API. Fleet, Onboarding and Focus are
placeholders until #14/#15.

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
| `onboarding/bindings/<equipmentId>.bindings.json` | `validateBindings`, `equipmentId` | overwrite |

`templates/` and `primitives/` are read-only. Files are written as received (`JSON.stringify(value, null, 2)` plus a newline); mutable files are replaced atomically.
