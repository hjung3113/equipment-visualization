# Implementation worker rules — issue wave (read before your task)

**You are the IMPLEMENTATION WORKER, not the conductor.** Edit files directly in this worktree. Do not dispatch
agents and do not ask who dispatches; if something is ambiguous, make the smallest reasonable call and record it
in your report.

1. **Read first:** root `AGENTS.md`, then the docs your task names (normally `GLOSSARY.md`, `docs/DESIGN-v0.4.md`,
   `docs/REPLAY-CONTRACT.md`, `docs/ONBOARDING.md`, `docs/VIEWS.md`, `docs/INTEGRATION.md`, `docs/adr/`) and any nested `AGENTS.md` on the paths you touch. A design
   marked **Proposed** is not implemented behaviour; build only what the task asks.
2. **Run the narrowest checks yourself before you report:** the test files you touched or added
   (`vitest run <files>`, never watch mode; the worker cap comes from the environment, so add no worker flags),
   plus the package's `typecheck` script when one exists. For assets, run
   `python3 .claude/skills/issue-wave-conductor/scripts/asset-check.py . <changed asset paths>`. Fix what fails and
   put the commands and results in your report. Test runs stay in the foreground and finish (no trailing `&`, no
   `nohup`): several workers share one machine, and a killed runner leaves its pool children orphaned.
   In React lifecycle code, never write refs or read the DOM during render; use event handlers, effects, or
   render-phase state adjustment.
   **Never** run git (commit, stash, reset, checkout, restore), anything that needs the network, or
   `pnpm install`/`add`/`update`; the conductor pre-installs dependencies. Leave all changes uncommitted — the
   conductor commits and runs the full gates.
3. **Domain invariants (AGENTS.md "Architecture constraints") — a violation is a blocker:**
   - `core`, renderer, editor and replay never import `@ap/*`, analytics-platform code or a company parser; only
     `packages/platform-adapter` may.
   - Structured `Catalog + Layout + Topology + MappingVersion + Observations` is the source of truth; SVG and
     draw.io are derived. Never read meaning back out of SVG geometry.
   - Geometry and connectivity are separate data: never infer a port, transfer capability or robot path from
     visual adjacency.
   - Arm count and blade count are independent; unknown kinematics stay `unknown`, never a plausible default.
   - Keep stable IDs, units (`abstract` is never promoted to `mm`), levels, ports, schema versions and provenance.
   - Replay output carries `observed`, `derived`, `illustrative` or `unknown`; interpolation is never
     `observed`. The reducer is deterministic: same input order-independent where the contract says so, no clock,
     no randomness, no I/O.
   - Test data is synthetic. No confidential images, logs, hostnames or private addresses.
4. **No suppressions:** no `biome-ignore`, `eslint-disable`, `@ts-ignore` or `@ts-nocheck`
   (`worker-hygiene.sh` fails on them). Touch only the lines you change; never reformat a whole file.
5. **Test first.** Add or extend the failing test, then make the smallest change that passes it. One test per
   acceptance criterion; `it.each` for variants. Replay changes cover the cases in AGENTS.md (ties, open
   occurrences, Data Quality Issues, Time Anomalies, Watermark/Binding boundaries, invalid mappings, duplicate wafer occupancy, evidence fidelity) that the
   task touches. **Do not change the setup, fixtures or assertions of existing tests** unless the task says the
   behaviour they pin is being removed — then say which test and why in the report.
6. Scope is exactly the task file, including any pre-existing items it lists as folds. No unrelated refactors.
   A breaking format or API change needs an ADR under `docs/adr/`; if the task does not provide one, stop and say
   so in the report. Update any doc the change makes wrong, in the same diff.
7. **Report:** write `.review/W-<issue>-REPORT.md` — files changed (one line why each), tests added (which
   acceptance criterion each covers), existing tests you changed and why, anything not done, open questions.
   Its **last line** is the sentinel from your task. Write the sentinel only when all edits are finished.
8. **Do not call `orca`.** Terminals, worktrees and orchestration belong to the conductor. If a needed command is
   blocked, finish with the report and state the command and blocker; do not retry it.
