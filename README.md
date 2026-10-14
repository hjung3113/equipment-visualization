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
3. Motion fidelity must be explicit: observed positions vs reconstructed transitions vs illustrative animation vs unknown.
4. No confidential factory images/logs may be added here. Test with synthetic fixtures and public references only.
5. Follow platform design tokens **only in the platform adapter**, using theme injection rather than copying platform UI components.

## Planned packages

```
apps/studio/                   # Standalone web app (planned)
packages/core/                # Semantic layout, ports, robot specs (planned)
packages/renderer/            # SVG-first rendering and interaction (planned)
packages/editor/              # Semantic Top View editor (planned)
packages/replay/              # Observations -> deterministic replay (planned)
packages/platform-adapter/    # Optional analytics-platform integration (planned)
assets/                       # Reusable symbols & generalized layout fixtures (planned import)
docs/                         # Design, decision records, research
skills/                       # Reference image -> semantic SVG workflow
```

## Initial validation targets

Single-hub cluster, multi-hub cluster, linear wet clean, stacked photo track, dual-stage lithography and vertical batch furnace. They serve as **structural conformance fixtures**, not exact AMAT/Lam/SEMES/ASML/Canon/ASM models.

## Roadmap

1. Import and review v0.3 research, normalized schemas, and generalized SVG prototypes.
2. Build standalone `apps/studio` with synthetic data and zero platform runtime imports.
3. Validate semantic ports/kinematic constraints (where known) and SVG round-trip.
4. Implement a deterministic observation reducer and playback timeline.
5. Integrate through a **separate** analytics-platform PR after its integration issues and private-submodule CI access gate are resolved.

Related: [analytics-platform](https://github.com/hjung3113/analytics-platform) and platform issue [#291](https://github.com/hjung3113/analytics-platform/issues/291) (broader visualization capability work; avoid overlap).
