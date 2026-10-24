## equipment-visualization addendum

- Base ref: `origin/develop` (`git diff origin/develop...HEAD`).
- The conductor already ran `verify.sh` (root lint/typecheck/test/build when defined, the package-boundary check,
  `asset-check.py`, worker hygiene); results and the `review-plan.py` output are in `.review/W-<issue>-VERIFY.md`.
- Look and behaviour in the running Studio belong to `review-ux`.
- **Boundary first** when the plan flags `boundary`: no `@ap/*` other than `@ap/ui` (none at all in core/renderer), analytics-platform or parser import outside
  `packages/platform-adapter` (ADR-0013); no platform menus, auth or scope logic inside core/renderer/editor/replay; the
  adapter receives data through explicit props/adapters (`docs/INTEGRATION.md`).
- **Domain invariants** (root `AGENTS.md`, `GLOSSARY.md`, `docs/DESIGN-v0.4.md`):
  - structured data is the source of truth, SVG derived; nothing reads meaning back out of geometry;
  - geometry and connectivity stay separate; no port, transfer or trajectory inferred from adjacency;
  - arm and blade counts independent; unknown kinematics, dimensions and stacking stay `unknown`;
  - stable IDs, units, levels, ports, schema versions and provenance preserved; a breaking format change has an ADR.
- **Replay** when the plan flags `replay` (`docs/REPLAY-CONTRACT.md`): the reducer is deterministic (no clock,
  randomness or I/O); every rendered state carries `observed`/`derived`/`illustrative`/`unknown`, and
  interpolation is never `observed`; trace ties, open occurrences, Data Quality Issues, Time Anomalies,
  Watermark/Binding boundaries, invalid mappings and duplicate wafer occupancy through the changed code.
- **Schema/assets** when the plan flags `schema`: unique IDs, source/target ports exist, valid levels, no hierarchy
  cycles, `viewBox`, no executable SVG content, snapshot updates intended. Flag `schema_without_adr` if the change
  breaks the format.
- Fixtures are synthetic.
- UI lens (only when the task says no UX review): check selection, layer toggles, keyboard and focus, accessible
  names, and that uncertainty and fidelity labels are visible.
