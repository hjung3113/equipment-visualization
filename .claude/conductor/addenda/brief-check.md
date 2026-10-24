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
    interpolation is never `observed`; no `@ap/*` in core/renderer and none but `@ap/ui` elsewhere outside the adapter) and names a test that would catch a breach.
E2. **Replay cases are enumerated.** A reducer change lists which of ties, open occurrence, Data Quality Issue, Time
    Anomaly, Watermark/Binding boundary, invalid mapping and duplicate occupancy it covers, and says the others are
    out of scope.
E3. **Fixtures are synthetic and generalized.** No vendor-specific dimensions, real equipment IDs, hostnames or
    images; archetype fixtures are structural (`docs/ASSET-REVIEW.md`), not OEM-faithful.
E4. **Format changes carry an ADR.** A breaking change to a layout, catalog, mapping or observation format names
    the ADR (`ls docs/adr` for the next free number; parallel issues collide) or is split out.
E5. **Acceptance commands cover the test files.** The lint and typecheck commands in a brief name the package's
    `test/` folders as well as `src/` (`pnpm exec eslint packages/<p>` rather than `packages/<p>/src`); a brief that
    named only `src` let `no-explicit-any` and `preserve-caught-error` in a new test reach host verification (#106).
E6. **A large-input change is measured where it renders.** When a brief lifts a size guard or speeds up a
    computation for large inputs, its acceptance includes a real-browser timing on a generated large input with
    realistic context (Binding, Layout, Mapping), not only a Node benchmark: #106 made a 50k-window Gantt computable
    in 285 ms, and the browser then drew 200k SVG rects (6.2 s load, 1.9 s per step).
E7. **UI copy uses glossary terms.** Every label, button text and accessible name a brief prescribes is checked
    against `GLOSSARY.md`, including each entry's _Avoid_ list: the #145 brief prescribed a `Replay` action for the
    screen GLOSSARY calls **Focus** (_Avoid_: replay 화면), and the slice-close quality review had to rename it (#150).
E8. **A brief that mirrors a platform contract copies every validating step.** When a brief makes the adapter satisfy
    an analytics-platform rule (manifest, endpoint, registration), it copies or names every place the host validates
    it, not only the first: the 177c brief copied AP `mountModule` and missed `createRegistry` (param-free parent,
    one primary menu per group), which the code review caught as two blockers (#189). Read the SDK release tag, not AP
    `main`, and check that adopted `@ap/ui` parts render with the platform styles (impl-rules addendum, #192).
