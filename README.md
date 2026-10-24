# Equipment Visualization

Reusable, standalone equipment Top View editor and explainable log replay toolkit for semiconductor equipment.

> **Status: Runnable Studio shell and layouts page.** Onboarding steps ①–⑥ (Fleet, Inventory, Template proposals, Mapping Board, ⑤ dry-run, ⑥ Publish) are in (#14); Drift ⑦ is pending; Focus (#15) is in: Top View, Gantt, lists, playback, Sequence step and the illustrative toggle (#15a–d); Journey (#152) is in: one wafer's numbered hops on the Top View with hop and execution lists. The sample layouts are generalized **concepts**, not manufacturers' actual mechanical drawings or validated kinematics.

## Goals

- **Standalone Studio**: build and edit SVG-based equipment diagrams without depending on any analytics platform.
- **Reusable assets**: versioned primitives, assemblies, semantic IDs, attachment ports, and layout definitions.
- **Equipment Viewer**: render top/side/layer views with consistent semi-flat technical styling.
- **Log Replay**: visualize observed module, wafer, robot, carrier and stage events; never pretend inferred/interpolated motion is observed fact.
- **Platform integration**: analytics-platform is the default host ([ADR-0012](docs/adr/0012-platform-first-sdk-host.md)); `packages/platform-adapter` implements the platform SDK contract, preserving its URL/Scope/Permission/menuQuery contracts. The standalone Studio is a second host.

## Boundaries

1. Domain model and renderer **must not import** `@ap/*`, platform Kernel, or a company parser.
2. Preserve structured `Layout + Component Catalog + Topology + Mapping Version + Observations` as authoritative data; SVG is a derived artifact.
3. Evidence must be explicit: observed vs derived vs illustrative animation vs unknown (see [ADR-0003](docs/adr/0003-facet-evidence-levels.md)).
4. No confidential factory images/logs may be added here. Test with synthetic fixtures and public references only.
5. Every screen, the standalone Studio included, uses the analytics-platform design system: `@ap/ui` from the platform SDK Release tarball ([ADR-0013](docs/adr/0013-platform-sdk-release-tarballs.md)), never copied, with the platform shell structure ([ADR-0008](docs/adr/0008-platform-design-system-fops-ui.md)). `core` and the renderer stay design-system-free and read only `--eqv-*`; inside the platform, the adapter's `styles.css` imports the `@eqv/ui` theme mapping (`@eqv/ui/theme.css`) of `--eqv-*` to platform tokens.

## Packages

```
apps/studio/                   # Standalone web app: shell, `/layouts` page (viewer, geometry editing — drag, nudge, 15° rotate, grid snap, undo/redo (#158) — Component assembly/name/delete and explicit Physical Interface, Port, Holding Site and Transfer Capability editing (#166–168), import/export, draft, Layout Revision publish), dev-only file API (present); Fleet, Onboarding ①–⑥ incl. the Mapping Board, ⑤ dry-run and ⑥ Publish (present, #14); Focus screen with playback (#15c–d) and Journey (#152) present; Drift ⑦ pending
packages/core/                # Layout schema/validator, Occurrence & Scene State contracts, Mapping, Onboarding core, deterministic replay reducer, Component transform helpers (`componentLocalMatrix`, `componentWorldMatrix`, `multiplyMatrix`, `invertMatrix`, `Matrix2D`), shared `round3`, and Port placement helpers (`componentWorldCenter`, `portPositionToward`, `projectToFootprint`) (present)
packages/renderer/            # Present — static `TopView`/`buildScene` plus interactive `TopViewer` (selection, keyboard, pan/zoom, #12b), Scene State replay overlay and highlight (#15b), Journey hop badges (#152), host `renderControls` zoom-controls slot (#73), and an `onComponentDrag` callback for host-side editing (#156), plus `PRIMITIVE_CATALOG` for assembly (#166)
packages/editor/              # Onboarding editor parts: Fleet table, Inventory, Template proposals, Mapping Board, Publish panel, and the layout edit model (move/rotate/snap/undo, Component assembly/name/delete and explicit connection editing, #157/#166–168). TS source (no build step); screens on `@ap/ui` / `@eqv/ui`, including the Mapping Board (no `editor.css`)
packages/ui/                  # `@eqv/ui`: EV components for patterns `@ap/ui` lacks, built on its primitives and tokens (`DataTable`, `EvidenceBadge`, `Legend`, `ViewerZoomControls`, `AppFrame`, `Page`, `Panel`, `StateMessage`/`LoadingBlock`, `FileButton`, `DetailFields`, `FormField`, `Tabs`, `OutlineBadge`); the status badge and toasts are `@ap/ui` `StatusBadge` and `Toaster`/`toast`
packages/replay/              # Focus and Journey screen parts over the core reducer: component-lane Gantt, Occurrence / Data Quality / evidence lists, shared cursor, playback controls, record steps, example-motion ghosts, Journey hop and execution lists; TypeScript source on `@ap/ui` / `@eqv/ui` (present)
packages/views/               # `@eqv/views`: host-neutral screen compositions; `FocusView` (Top View · Gantt · Occurrence list on one cursor, from props only), `NoticeList` and the Gantt budgets, over core, renderer, replay and `@ap/ui` / `@eqv/ui` (present, #177)
packages/platform-adapter/    # analytics-platform host module (ADR-0012): manifest + endpoint declarations + theme styles + `eqv:topview`/`eqv:focus` screens present; AP mount pending (AP #333/#334)
tooling/                      # Workspace tooling: ESLint package-boundary guard (present)
assets/                       # 25 reusable primitives & 6 generalized v0.4 templates (present)
fixtures/  # Synthetic source-shaped replay fixtures (present)
docs/                         # Design, decision records, research
skills/                       # Reference image -> semantic SVG workflow
```

## Development

Prerequisites:

- Node.js from [`.nvmrc`](.nvmrc) (26.7.0) — e.g. `nvm install` or `fnm use` in this directory.
- pnpm 11.1.1, the version pinned by the `packageManager` field in `package.json` (e.g. `npm install -g pnpm`; `corepack enable pnpm` also works on Node versions that ship corepack).

```sh
git clone https://github.com/hjung3113/equipment-visualization.git
cd equipment-visualization
pnpm install
pnpm lint        # ESLint flat config across all packages (incl. the @ap/* boundary rule)
pnpm typecheck   # turbo run typecheck
pnpm test        # turbo run test
pnpm build       # turbo run build
pnpm dev         # builds core/renderer, then starts the Studio dev server (see apps/studio/README.md)
git config core.hooksPath .githooks   # once per clone: enables pre-commit / pre-push guards
```

`@ap/ui` (ADR-0008, ADR-0013) is installed from the platform SDK GitHub Release tarball named in `package.json` and `pnpm-workspace.yaml`; `pnpm install` needs access to GitHub Releases. `typecheck`, `test` and `build` run in two steps (build the `@eqv/*` dependencies, then the task with `--only`) so a task never runs before the packages it imports are built.

Toolchain (versions pinned in `package.json` / `pnpm-lock.yaml`):

| Tool | Version | Note |
| --- | --- | --- |
| TypeScript | 5.9.3 | |
| vitest | 3.2.7 | |
| turbo | 2.11.4 | |
| ESLint | 10.11.0 | |
| React | 19.3.1 | added in S7/S8 (#12/#13) |
| vite | 7.3.7 | added in S7/S8 (#12/#13) |


### Layout schema changes

The zod schema in `packages/core/src/layout/schema.ts` is the single source of truth.
Regenerate the committed `packages/core/schema/layout.schema.json` snapshot with:

```sh
pnpm --filter @eqv/core exec vitest run -u test/layout.test.ts
```

An additive change (a new optional field) updates both files in the same PR. A breaking
change (rename, removal, new required field, changed meaning, or enum value removal)
bumps `schemaVersion` and requires an ADR in `docs/adr/` merged first or in the same PR
(see `AGENTS.md`).

## Initial validation targets

Single-hub cluster, multi-hub cluster, linear wet clean, stacked photo track, dual-stage lithography and vertical batch furnace. They serve as **structural conformance fixtures**, not exact AMAT/Lam/SEMES/ASML/Canon/ASM models.

## Design and project tracking

- [Glossary](GLOSSARY.md) · [Design v0.4](docs/DESIGN-v0.4.md) · [ADRs](docs/adr/) · [Delivery plan](docs/DELIVERY-PLAN.md) · [Replay contract](docs/REPLAY-CONTRACT.md)
- [Analytics-platform integration](docs/INTEGRATION.md) · [Public research](docs/RESEARCH.md) · [Asset review](docs/ASSET-REVIEW.md)
- [Onboarding](docs/ONBOARDING.md) · [Views](docs/VIEWS.md) · [Reference-to-SVG skill](skills/reference-to-semantic-topview/SKILL.md) (read directly; not under `.claude/skills/`, so agents do not auto-discover it) · [Agent rules](AGENTS.md)
- Issues: [M0 asset import](../../issues/1), [M1 standalone Studio](../../issues/2), [M2 replay](../../issues/3)
- Platform integration tracking: [Submodule/CI #332](https://github.com/hjung3113/analytics-platform/issues/332), [UX #333](https://github.com/hjung3113/analytics-platform/issues/333), [data #334](https://github.com/hjung3113/analytics-platform/issues/334), [E2E #335](https://github.com/hjung3113/analytics-platform/issues/335).

**Repo status:** the v0.3 design documents are committed. Six converted v0.4 templates and 25 themed primitives from the v0.3 pack are in `assets/` (see `assets/NOTICE.md`); template SVG/PNG and the original generators remain outside the repository; `apps/studio` runs (`pnpm dev`: app shell, layouts page, dev file API); Onboarding ⑤ dry-run and ⑥ Publish are in (#14); Drift ⑦ is still pending (tracked as M1/M2); the Focus screen with playback is in (#15c–d). This repository is **public** (since 2026-10-15), like the parent analytics-platform; the platform SDK comes from its release tarballs (ADR-0013), and `packages/platform-adapter` declares the host module that analytics-platform will mount (AP #333/#334).

## Roadmap

1. Import and review v0.3 research, normalized schemas, and generalized SVG prototypes.
2. Build standalone `apps/studio` with synthetic data and zero platform runtime imports.
3. Validate semantic ports/kinematic constraints (where known) and SVG round-trip.
4. ~~Implement a deterministic observation reducer~~ (done in `@eqv/core`: `seekSceneState`, `stepSceneState`, `replayKey`); build the playback timeline.
5. Integrate through a **separate** analytics-platform PR that mounts `@eqv/platform-adapter` and serves its endpoints (AP #333/#334); the install path for `@eqv/*` is decided there (#187).

Related: [analytics-platform](https://github.com/hjung3113/analytics-platform) and platform issue [#291](https://github.com/hjung3113/analytics-platform/issues/291) (broader visualization capability work; avoid overlap).
