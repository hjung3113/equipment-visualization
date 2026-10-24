# @eqv/platform-adapter

The analytics-platform host module (ADR-0012, ADR-0013). The only package that imports `@ap/contracts`; it may import only `@ap/contracts` and `@ap/ui` from the platform SDK (ESLint-enforced, mirrors AP's `hostModule` preset). `@ap/contracts` and `@ap/ui` are peer dependencies (devDependencies: the 0.12.0 release tarballs).

## Exports

- `eqvManifest` — `ModuleManifest` (host contract 1): module `eqv`, `requires: ['query']`, `optional: ['detailSlot']`, group `eqv:equipment`, read-only screens `topview` (the module prefix itself, the group's primary screen; page key `equipment`, i.e. `?equipment=`) and `focus` (`<prefix>/focus`, child of `topview`; page keys `equipment`, `window`, `entityType`, `anchor`), permission `eqv:view`. The equipment id is a page key, not a route param, because AP's registry rejects a parent whose route needs params and requires one primary screen per group. The host registers the screens as `eqv:topview` / `eqv:focus`.
- `TOPVIEW_SCREEN`, `FOCUS_SCREEN` — the bare screen ids.
- `topviewContext` (`eqv.topview-context`) and `topviewEvents` (`eqv.topview-events`) — `defineEndpoint` declarations; responses are `@eqv/core` types. Time is host-projected (`context.time: 'apply'`), never a param. See `docs/INTEGRATION.md`.
- `@eqv/platform-adapter/styles.css` — imports `@eqv/ui/theme.css` (the single owner of the `--eqv-*` → platform-token mapping) and `@eqv/ui/styles.css`.

**Names are Candidates** until AP #334 confirms the endpoint ids, group and permission strings.

## Not here yet (177d)

Screen components (`({ host, params })` using `host.query`), the `@eqv/replay` / `@eqv/views` style imports, and mounting in `apps/platform-web` (an AP PR).

## Check

`test/contract.test.ts` re-implements the AP kernel's `mountModule` manifest rules and the `createRegistry` rules that apply to a module's menus (parent route without params, one primary per group, no global-Context page key, unique route shapes, `isPathPattern`) (the kernel is not importable here) and checks the endpoint declarations against the manifest.
