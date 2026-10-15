# Brief check — before the implementer starts

You check an implementation brief, not code. Read-only: the only file you write is your report. Do not edit,
format, commit, stash or checkout. Read-only shell (`git log`, `rg`, `sed -n`) is fine. Your task names the brief
and the report path; this checkout sits at the current `origin/develop`, the code the brief will change.

Each finding names the brief line, what is wrong on `origin/develop`, and the corrected wording. Report only defects
that would cost a review or fix round; style and wording preferences are out of scope.

## What to check

1. **Named things exist.** Every path, type, schema, fixture, test file and doc section the brief names exists on
   `origin/develop` and says what the brief says. A brief that says "validate with the shared schema" when none exists
   makes the worker invent one. Docs marked **Proposed** are design, not code: the brief must say which part it
   implements.
2. **Rules are copied, not remembered.** Field names, cardinalities, units and enum values (fidelity labels, event
   kinds, levels) match `GLOSSARY.md`, `docs/DESIGN-v0.4.md`, `docs/REPLAY-CONTRACT.md`, `docs/ONBOARDING.md`, `docs/VIEWS.md` and the code, not the issue text.
3. **Invariants are stated where they bite.** If the work touches geometry, ports, robots or replay, the brief
   repeats the relevant AGENTS.md constraint (no connectivity from adjacency; arm ≠ blade; unknown stays unknown;
   interpolation is never `observed`; no `@ap/*` outside the adapter) and names a test that would catch a breach.
4. **Regression tests reach the bug.** Trace each prescribed test through the current code: it must enter the
   changed branch, so removing the fix turns it red.
5. **Replay cases are enumerated.** A reducer change lists which of ties, open occurrence, Data Quality Issue, Time Anomaly,
   Watermark/Binding boundary, invalid mapping and duplicate occupancy it covers, and says the others are out of scope.
6. **Fixtures are synthetic and generalized.** No vendor-specific dimensions, real equipment IDs, hostnames or
   images; archetype fixtures are structural (`docs/ASSET-REVIEW.md`), not OEM-faithful.
7. **Format changes carry an ADR.** A breaking change to a layout, catalog, mapping or observation format names
   the ADR (`ls docs/adr` for the next free number; parallel issues collide) or is split out.
8. **Same-slice overlap.** If an issue merged earlier in this slice touched the same module, schema or doc section
   (`git log origin/develop --since=<slice start> -- <paths>`), the brief names that change and keeps its behaviour.
9. **Commands and flags exist.** Every command and flag the brief tells the worker or conductor to run is confirmed
   with `--help` or the repo's `package.json`. Dependency changes are pre-installed by the conductor (`PRE_ADD`); a
   brief never asks a worker to install or add packages.
10. **Removed markup has a test list.** A brief that removes a role, test id, label or `data-component-id` lists
    every test and snapshot that queries it.
11. **Contract inputs use the exact shape.** Tests for a contract (`OccurrenceBatch`, `ObservedInventory`,
    `ComponentMetric`, a Mapping Version file) feed the shape the producer actually emits, per
    `docs/REPLAY-CONTRACT.md`/`docs/ONBOARDING.md`/`docs/VIEWS.md`, not an idealised payload.
12. **Lifecycle events are enumerated.** When behaviour hangs on an event (selection change, Level switch, cursor
    move, publish), the brief lists every representation the call sites use (absent prop vs `null`, unmount vs hide).
13. **Mount lifetime.** A change that keeps a component mounted across a context change (equipment, Binding segment,
    view mode) lists that component's local state (refs, optimistic sets, cursors) and decides each one's lifetime.
14. **Waiting guards end.** A guard that waits for an event (render settle, worker result, file write) has a bounded
    release for the no-event path, and its test covers that path.
15. **Lifecycle code facts.** For focus, mount, animation or async-ordering behaviour: library timing comes from the
    installed source (`node_modules/...`, file:line), not memory; the design writes no refs and reads no DOM during
    render.

## Report

Write the report your task names: a verdict line (`ready` or `fix brief`), then findings ordered by the round they
would cost. End with the sentinel line your task gives, exactly.
