# Development rules — equipment-visualization

## Purpose
Build a reusable semantic equipment Top View and explainable log replay framework. The repository must remain **standalone**; analytics-platform is an optional consumer, not a dependency.

## Before implementation
- Read `README.md`, `CONTEXT.md` (glossary), `docs/DESIGN-v0.4.md`, `docs/REPLAY-CONTRACT.md`, `docs/ONBOARDING.md`, `docs/VIEWS.md`, `docs/INTEGRATION.md`, `docs/adr/`.
- Distinguish **Proposed** design from implemented/validated functionality.
- Work from GitHub issues, record design decisions in an ADR before breaking format/API changes.
- Prefer tests on 6 generalized equipment archetypes over OEM-faithful depiction claims.
- No company-confidential reference images, logs, secrets or private network addresses.

## Architecture constraints
- `core`/renderer/editor/replay cannot depend on analytics-platform `@ap/*` or its Kernel/Shell.
- Make source of truth `Catalog + Layout + Topology + MappingVersion + Observations`, not flattened SVG.
- Geometry and connectivity are different data. Never infer a physical port or robot trajectory from visual adjacency.
- Robot arm and blade counts are independent; uncertain kinematics must be represented as unknown.
- Preserve stable IDs, units, layers, ports, semantic groupings, schema versions and data provenance.
- Log replay MUST label every facet (location, material identity, start, end) `observed`, `derived`, `illustrative` or `unknown` (ADR-0003). Visual interpolation is never log evidence.
- Replay consumes source-paired Occurrences ordered by Record Sequence; it never pairs Start/End itself (ADR-0002).
- Use synthetic test data. Sanitized, permissioned internal integrations belong in a separate deployment layer.

## Change quality gates
- Every change: lint, typecheck, tests, build (when the package exists).
- Asset/schema changes: validate XML/JSON, unique IDs, source/target ports, valid levels, no cycles in hierarchy, viewBox, no executable SVG content, snapshots.
- Replay changes: deterministic reducer, ties, open occurrences (`end=null`), Data Quality Issues, Time Anomalies, Watermark and Binding boundaries, invalid mappings, duplicate wafer occupancy, evidence fidelity.
- UI changes: browser interaction, keyboard/a11y, variants review. In analytics-platform, honor its `?variant=` prototype approval and E2E gates.
- Report unrun checks honestly; run reviewer pass for major design, auth, data trust or package boundary changes.

## Integration rules
- Platform handles auth/Scope/time/route/context/permissions/audit; visualization accepts data through explicit props/adapters.
- Platform menus consume through declared `menuQuery` endpoints; no domain-specific methods on `PlatformAdapter`.
- Do not modify analytics-platform from this repository; coordinate separate PRs/issues.
- Parent git submodule pins a commit; new revision requires explicit parent change and lockfile/CI validation.
