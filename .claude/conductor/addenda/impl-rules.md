## equipment-visualization addendum

Overrides and additions to the numbered rules above.

- Read first: root `AGENTS.md`, then the docs your task names (normally `GLOSSARY.md`, `docs/DESIGN-v0.4.md`,
  `docs/REPLAY-CONTRACT.md`, `docs/ONBOARDING.md`, `docs/VIEWS.md`, `docs/INTEGRATION.md`, `docs/adr/`) and any
  nested `AGENTS.md` on the paths you touch. A design marked **Proposed** is not implemented behaviour; build only
  what the task asks.
- Before the first test loop, build the workspace packages once: `pnpm exec turbo run build
  --filter=@eqv/studio^...`. A fresh worktree has no `dist` for workspace packages, so a
  package test that imports another `@eqv/*` package fails until it is built.
- Rule 1 checks: `vitest run <files>` plus the package's `typecheck` script when one exists. For assets, run
  `python3 .claude/conductor/scripts/asset-check.py . <changed asset paths>`.
- **No suppressions:** no `biome-ignore`, `eslint-disable`, `@ts-ignore` or `@ts-nocheck` (`worker-hygiene.py`
  fails on them).
- **Domain invariants (AGENTS.md "Architecture constraints") — a violation is a blocker:**
  - `core` and renderer never import `@ap/*`; editor, replay, ui and the Studio import only `@ap/ui` (ADR-0013);
    no package imports analytics-platform code or a company parser; only `packages/platform-adapter` imports
    `@ap/contracts`.
  - Structured `Catalog + Layout + Topology + MappingVersion + Observations` is the source of truth; SVG and
    draw.io are derived. Never read meaning back out of SVG geometry.
  - Geometry and connectivity are separate data: never infer a port, transfer capability or robot path from visual
    adjacency.
  - Arm count and blade count are independent; unknown kinematics stay `unknown`, never a plausible default.
  - Keep stable IDs, units (`abstract` is never promoted to `mm`), levels, ports, schema versions and provenance.
  - Replay output carries `observed`, `derived`, `illustrative` or `unknown`; interpolation is never `observed`.
    The reducer is deterministic: same input order-independent where the contract says so, no clock, no
    randomness, no I/O.
  - Test data is synthetic. No confidential images, logs, hostnames or private addresses.
- Replay changes cover the cases in AGENTS.md (ties, open occurrences, Data Quality Issues, Time Anomalies,
  Watermark/Binding boundaries, invalid mappings, duplicate wafer occupancy, evidence fidelity) that the task
  touches.
- A breaking format or API change needs an ADR under `docs/adr/`; if the task does not provide one, stop and say so
  in the report.
- Report (rule 6) also lists, per test added, which acceptance criterion it covers, and for each changed file one line
  explaining why it changed.
- **An adopted `@ap/ui` part must render with the platform's own styles:** check its computed style (or that its utility classes exist in the built Studio CSS) against the platform screen of the same kind, not only its markup. The Studio imports the design system through `@ap/ui/styles.css`; a piecewise import missed `platform-tokens.css` and left the platform `StatusBadge` unstyled (#177 node 177f, 2026-10-24).
