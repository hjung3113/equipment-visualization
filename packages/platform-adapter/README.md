# @eqv/platform-adapter

The analytics-platform host module (ADR-0012, ADR-0013). The only package that imports `@ap/contracts`; it may import only `@ap/contracts` and `@ap/ui` from the platform SDK (ESLint-enforced, mirrors AP's `hostModule` preset). `@ap/contracts` and `@ap/ui` are peer dependencies (devDependencies: the 0.19.0 release tarballs).

## Exports

- `eqvManifest` — `ModuleManifest` (host contract 1): module `eqv`, `requires: ['query']`, `optional: ['detailSlot']`, group `eqv:equipment`, read-only screens `topview` (the module prefix itself, the group's primary screen; page key `equipment`, i.e. `?equipment=`) and `focus` (`<prefix>/focus`, child of `topview`; page keys `equipment`, `entityType`, `anchor`), permission `eqv:view`. The equipment id is a page key, not a route param, because AP's registry rejects a parent whose route needs params and requires one primary screen per group. The host registers the screens as `eqv:topview` / `eqv:focus`.
- `TOPVIEW_SCREEN`, `FOCUS_SCREEN` — the bare screen ids.
- `topviewContext` (`eqv.topview-context`) and `topviewEvents` (`eqv.topview-events`) — `defineEndpoint` declarations; responses are `@eqv/core` types. Time is host-projected (`context.time: 'apply'`), never a param. See `docs/INTEGRATION.md`.
- `eqvScreens` — `Record<'topview' | 'focus', ComponentType<ModuleScreenProps>>`, keyed by the manifest screen ids (also `TopViewScreen`, `FocusScreen`).
- `@eqv/platform-adapter/manifest` — `eqvManifest`, `TOPVIEW_SCREEN`, `FOCUS_SCREEN`, `topviewContext`, `topviewEvents` and their param types with no React, screen, replay or renderer module reachable; a host registers from here and loads the screens lazily from the root.
- `@eqv/platform-adapter/mock-data` — synthetic `eqvMockContext` / `eqvMockEvents` (+ `EQV_MOCK_EQUIPMENT`, `EQV_MOCK_WINDOW`) for a host's mock server, generated from `fixtures/cluster-single` (`pnpm --filter @eqv/platform-adapter gen:mock-data`); never import it from production code.
- `@eqv/platform-adapter/styles.css` — imports `@eqv/ui/theme.css` (the single owner of the `--eqv-*` → platform-token mapping), `@eqv/ui/styles.css` and the `@eqv/replay` and `@eqv/views` styles.

**Names are Candidates** until AP #334 confirms the endpoint ids, group and permission strings.

## Screens

`eqv:topview` (the layout and scene state as of the end of the applied window, Component detail, "Focus 열기") and `eqv:focus` (`FocusView` on one cursor, "Top View로"). Both read the equipment from `host.page('equipment')` and the time from `host.context()` (naive host seconds padded once with `.000`), load through `host.query` with the two declared endpoints only (`src/replay-load.ts`, one hook `src/use-replay-input.ts`), verify every Mapping Version and Layout (`verifyBindingContext` from `@eqv/core`, then `assertReplayInput`) and draw nothing partial. Selection detail goes to `host.detail.show` when the host grants `detailSlot` (stable callback; `clear` on reset/unmount), inline otherwise. The full behaviour is in `docs/INTEGRATION.md` (화면 동작).

States (never a default range or a guessed equipment):

- `time` unsupported → "이 화면에는 시간 구간이 적용되지 않습니다"; no equipment → "설비를 고르세요"; no `from`/`to` → "시간 구간을 고르세요". None of them queries.
- Outcomes (decided in `replay-load.ts`):

| outcome | screen | `host.status` |
| --- | --- | --- |
| `ok` | renders `data` (null `data` = data error) | `ready` only if this screen had set `auth_required` |
| `empty` | empty state | none |
| `forbidden` | host-drawn state | `auth_required` |
| `error` | danger state with `message` and the `reportError` id | none |
| `timeout`, `too_large` | warning state, same fields | none |

  `unavailable` (hands the whole screen to the host for one failed query) and `identity_mismatch` (host session concept) are never set from a query outcome.
- Non-`clear` assessments become notices; `unknown` is worded "확인하지 못했습니다 — 이상 없음이 아닙니다", never as clear.
- Continuation pages merge into one batch in server order (ADR-0002); the first page's window fields, a page that disagrees is a data error, the greatest Watermark, no token. The loop ends on a missing token and is bounded by the server `maxHours`, a repeated token (data error) and the screen signal.

## Not here yet

Mounting in `apps/platform-web` (an AP PR, AP #333/#334) and the server endpoints.

## Check

`test/screens.test.tsx` (jsdom, a fake `ModuleHost` typed against `@ap/contracts` in `test/fake-host.ts`) covers the screens; `test/replay-load.test.ts` the host-time padding, page merge and assessment wording. `test/contract.test.ts` re-implements the AP kernel's `mountModule` manifest rules and the `createRegistry` rules that apply to a module's menus (parent route without params, one primary per group, no global-Context page key, unique route shapes, `isPathPattern`) (the kernel is not importable here) and checks the endpoint declarations against the manifest.
