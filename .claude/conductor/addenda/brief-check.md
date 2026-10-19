## equipment-visualization addendum (base ref `origin/develop`)

Examples and paths for the shared items:

- Item 1: also docs marked **Proposed** are design, not code: the brief must say which part it implements. Named
  things include fixtures and doc sections.
- Item 2: field names, cardinalities, units and enum values (fidelity labels, event kinds, levels) match
  `GLOSSARY.md`, `docs/DESIGN-v0.4.md`, `docs/REPLAY-CONTRACT.md`, `docs/ONBOARDING.md`, `docs/VIEWS.md` and the
  code.
- Item 8: a removed `data-component-id` also counts; list every test and snapshot that queries it.
- Item 10 and 11: the shared wording applies; the command source is `--help` or the repo's `package.json`.
- Item 4 (contract inputs): tests for a contract (`OccurrenceBatch`, `ObservedInventory`, `ComponentMetric`, a
  Mapping Version file) feed the shape the producer actually emits, per `docs/REPLAY-CONTRACT.md`,
  `docs/ONBOARDING.md`, `docs/VIEWS.md`.
- Item 5/6 examples: selection change, Level switch, cursor move, publish; mount contexts are equipment, Binding
  segment, view mode; cursors count as local state.
- Item 7 examples: render settle, worker result, file write.

Additional items for this repo:

E1. **Invariants are stated where they bite.** If the work touches geometry, ports, robots or replay, the brief
    repeats the relevant AGENTS.md constraint (no connectivity from adjacency; arm ≠ blade; unknown stays unknown;
    interpolation is never `observed`; no `@ap/*` outside the adapter) and names a test that would catch a breach.
E2. **Replay cases are enumerated.** A reducer change lists which of ties, open occurrence, Data Quality Issue, Time
    Anomaly, Watermark/Binding boundary, invalid mapping and duplicate occupancy it covers, and says the others are
    out of scope.
E3. **Fixtures are synthetic and generalized.** No vendor-specific dimensions, real equipment IDs, hostnames or
    images; archetype fixtures are structural (`docs/ASSET-REVIEW.md`), not OEM-faithful.
E4. **Format changes carry an ADR.** A breaking change to a layout, catalog, mapping or observation format names
    the ADR (`ls docs/adr` for the next free number; parallel issues collide) or is split out.
