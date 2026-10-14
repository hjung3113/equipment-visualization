# Equipment Visualization

Reusable, standalone equipment Top View editor and explainable log replay toolkit for semiconductor equipment.

> **Status: Design-first / research prototype (v0.3).** This repository is not yet an executable Studio, and the sample layouts are generalized **concepts**, not manufacturers' actual mechanical drawings or validated kinematics.

## Goals

- **Standalone Studio**: build and edit SVG-based equipment diagrams without depending on any analytics platform.
- **Reusable assets**: versioned primitives, assemblies, semantic IDs, attachment ports, and layout definitions.
- **Equipment Viewer**: render top/side/layer views with consistent semi-flat technical styling.
- **Log Replay**: visualize observed module, wafer, robot, carrier and stage events; never pretend inferred/interpolated motion is observed fact.
- **Platform integration**: optional adapter package for [analytics-platform](https://github.com/hjung3113/analytics-platform), preserving its URL/Scope/Permission/menuQuery contracts.

## Boundaries

1. Domain model and renderer **must not import** `@ap/*`, platform Kernel, or a company parser.
2. Preserve structured `Layout + Component Catalog + Topology + Mapping Version + Observations` as authoritative data; SVG is a derived artifact.
3. Evidence must be explicit: observed vs derived vs illustrative animation vs unknown (see [ADR-0003](docs/adr/0003-facet-evidence-levels.md)).
4. No confidential factory images/logs may be added here. Test with synthetic fixtures and public references only.
5. Follow platform design tokens **only in the platform adapter**, using theme injection rather than copying platform UI components.

## Planned packages

```
apps/studio/                   # Standalone web app (planned)
packages/core/                # Semantic layout, ports, robot specs (present; layout schema in #6)
packages/renderer/            # SVG-first rendering and interaction (planned)
packages/editor/              # Semantic Top View editor (planned)
packages/replay/              # Observations -> deterministic replay (planned)
packages/platform-adapter/    # Optional analytics-platform integration (planned)
tooling/                      # Workspace tooling: ESLint package-boundary guard (present)
assets/                       # Reusable symbols & generalized layout fixtures (planned import)
docs/                         # Design, decision records, research
skills/                       # Reference image -> semantic SVG workflow
```

## Development

Prerequisites:

- Node.js from [`.nvmrc`](.nvmrc) (26.7.0) — e.g. `nvm install` or `fnm use` in this directory.
- pnpm 11.1.1, the version pinned by the `packageManager` field in `package.json` (e.g. `npm install -g pnpm`; `corepack enable pnpm` also works on Node versions that ship corepack).

```sh
pnpm install
pnpm lint        # ESLint flat config across all packages (incl. the @ap/* boundary rule)
pnpm typecheck   # turbo run typecheck
pnpm test        # turbo run test
pnpm build       # turbo run build
git config core.hooksPath .githooks   # once per clone: enables pre-commit / pre-push guards
```

Toolchain (versions pinned in `package.json` / `pnpm-lock.yaml`):

| Tool | Version | Note |
| --- | --- | --- |
| TypeScript | 5.9.3 | |
| vitest | 3.2.7 | |
| turbo | 2.11.4 | |
| ESLint | 10.11.0 | |
| React | 19.3.0 | added in S7/S8 (#12/#13) |
| vite | 7.3.6 | added in S7/S8 (#12/#13) |


## Initial validation targets

Single-hub cluster, multi-hub cluster, linear wet clean, stacked photo track, dual-stage lithography and vertical batch furnace. They serve as **structural conformance fixtures**, not exact AMAT/Lam/SEMES/ASML/Canon/ASM models.

## Design and project tracking

- [Glossary](CONTEXT.md) · [Design v0.4](docs/DESIGN-v0.4.md) · [ADRs](docs/adr/) · [Delivery plan](docs/DELIVERY-PLAN.md) · [Replay contract](docs/REPLAY-CONTRACT.md)
- [Analytics-platform integration](docs/INTEGRATION.md) · [Public research](docs/RESEARCH.md) · [Asset review](docs/ASSET-REVIEW.md)
- [Onboarding](docs/ONBOARDING.md) · [Views](docs/VIEWS.md) · [Reference-to-SVG skill](skills/reference-to-semantic-topview/SKILL.md) · [Agent rules](AGENTS.md)
- Issues: [M0 asset import](../../issues/1), [M1 standalone Studio](../../issues/2), [M2 replay](../../issues/3)
- Platform integration tracking: [Submodule/CI #332](https://github.com/hjung3113/analytics-platform/issues/332), [UX #333](https://github.com/hjung3113/analytics-platform/issues/333), [data #334](https://github.com/hjung3113/analytics-platform/issues/334), [E2E #335](https://github.com/hjung3113/analytics-platform/issues/335).

**Repo status:** the v0.3 design documents are committed. The original generated SVG/JSON sample pack is **not yet imported** (tracked as M0 #1); there is no runnable Studio/replay app yet (tracked as M1/M2). This repository is **private**, while the parent analytics-platform is public; do not add the submodule to the parent until the access/CI gate (#332) is decided.

## Roadmap

1. Import and review v0.3 research, normalized schemas, and generalized SVG prototypes.
2. Build standalone `apps/studio` with synthetic data and zero platform runtime imports.
3. Validate semantic ports/kinematic constraints (where known) and SVG round-trip.
4. Implement a deterministic observation reducer and playback timeline.
5. Integrate through a **separate** analytics-platform PR after its integration issues and private-submodule CI access gate are resolved.

Related: [analytics-platform](https://github.com/hjung3113/analytics-platform) and platform issue [#291](https://github.com/hjung3113/analytics-platform/issues/291) (broader visualization capability work; avoid overlap).
