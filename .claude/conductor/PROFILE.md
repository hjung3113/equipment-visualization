# Conductor profile — equipment-visualization

Repo specifics for the global `issue-wave-conductor` skill (`~/.agents/skills/issue-wave-conductor/SKILL.md`, #46).
The loop, roles, state, shared traps and dated history live there; this file holds only what differs here. Root
`AGENTS.md` wins over both. `$CONDUCTOR` is this folder (`.claude/conductor/`).

Differences from the FeedbackOps original: no backend or database, and the repo is standalone (AGENTS.md).

## Flow

- `<base>` is `develop` (user decision 2026-10-14). Each issue gets `feature/<n>-<slug>` from `origin/develop` and a
  PR to `develop`. A finished slice goes `develop` → `main` through a release PR after `scripts/release-gate.sh`; the
  **user** merges it, always as a merge commit. Never merge to `main`.
- Shared `ship-pr.sh` refuses base `main` by default; `workerops.protectedBases` is unset in this clone, keep it so.
- `$MAIN` is `EV_MAIN` (`~/orca/projects/equipment-visualization`). Orca chooses the worktree location; the launcher
  finds it by name.
- `WAVE_BRIEFS` is `$EV_MAIN/.review/wave/` (`.review/` is gitignored).
- **Slice start:** separate **Proposed** design from what is implemented. Owner decisions include
  `docs/DELIVERY-PLAN.md` checklist items and format/ADR approval.
- **Slice order:** the dependency order in the slice issues (#5 → #6 → {#7, #8, #9} → {#10, #11, #12} → …) and
  `docs/DELIVERY-PLAN.md`: schema/core before viewer, mapping before Onboarding, reducer before Focus UI. A breaking
  format change needs its ADR merged first (or in the same PR).

## Launch

- `scripts/launch-worker.sh <n> <slug>`:
  - creates an Orca worktree from `origin/develop` and renames its branch to `feature/<n>-<slug>`;
  - copies `templates/impl-rules.md` and `templates/review-rules.md` into `.review/` and writes `.review/W-<n>-TASK.md`
    (the rules pointer, then `$WAVE_BRIEFS/<n>-task.md`);
  - closes setup shells, runs `pnpm install --frozen-lockfile` when a lockfile exists, applies `PRE_ADD`;
  - delegates to shared `worker-launch.sh` (role `WORKER_ROLE`, default `impl`; overrides `WORKER_MODEL` /
    `WORKER_EFFORT`).
- Needs `WAVE_STATE`, `WAVE_BRIEFS`, `EV_MAIN`.
- In-flight ceiling: ≈5–7 for one conductor, 2–3 when the conductor also runs every browser check.

## Complexity

`impl-complex` when any of these hold:

- it changes the replay reducer, `Seek(t)`, Record Sequence ordering, Time Anomaly handling or facet evidence
  derivation (ADR-0002, ADR-0003);
- it changes mapping semantics: Alias Rule precedence, Mapping Scope flattening, Mapping Version hashing or Binding
  resolution (ADR-0005);
- it changes a format or schema together with its consumers, or needs a new ADR;
- it touches the package boundary or `packages/platform-adapter`, or touches three or more packages;
- it carries ordering, determinism or state logic: undo/redo, publish revisions, the Mapping Board state, Template
  matching tie-breaks.

## Verify

1. `scripts/verify.sh <worktree>` (needs `WAVE_STATE`): root `lint`, `typecheck`, `test`, `build` when defined, the
   package-boundary check, `asset-check.py` and `worker-hygiene.sh`; prints a summary.
2. **Replay changes:** tests exist for each replay case the brief listed (ties, open occurrences, Data Quality
   Issues, Time Anomalies, Watermark and Binding boundaries, invalid mappings, duplicate occupancy, evidence
   fidelity); run the reducer suite twice, a different result is a determinism failure.
3. **Mapping changes:** the same Alias Rules produce the same Mapping Version hash on a second run.
4. **Asset/schema changes:** `asset-check.py` covers structure and SVG safety; port endpoints, levels and hierarchy
   cycles are covered by `packages/core`'s validator through `test`.

## Browser evidence

Once `apps/studio` exists (S8, #13): start the Studio dev server from the worktree's root `dev` script on a free port,
bound to `<label>.localhost`, and a second one from the wave baseline worktree (install: `pnpm install
--frozen-lockfile`). Captures go to `.review/<n>-shots/`. There is no preview script yet (see Tools → Not yet ported).

## Review

- Plan: `python3 scripts/review-plan.py <checkout> [--base origin/develop] [--head HEAD]`; rules pinned by
  `test-review-plan.py`. Docs-only changes get no roles.
- Flags go into every reviewer task: `boundary` (check the package boundary first), `replay`, `schema` (and
  `schema_without_adr`), `instructions` (`.claude/**`, `skills/**`, `AGENTS.md`, `CLAUDE.md`; global step 7a).
- Rules: `review-final` → `templates/review-rules.md`, copied to `.review/00-REVIEW-RULES.md`; `review-ux` →
  global `~/.agents/agents/review-ux.md` with § Review lens: UX; `review-quality` → global
  `~/.agents/agents/review-quality.md` with § Review lens: quality.
- Perf: no measurement tool and no `review-perf` rules yet; put any performance angle in the code reviewer's task.
- Conflict order starts with AGENTS.md invariants (package boundary, evidence fidelity, geometry ≠ connectivity,
  unknown stays unknown), then ADRs and recorded owner decisions.
- Value-gate critical defects here: wrong state shown, interpolation labelled `observed`, a boundary leak.
- Same-slice overlap is wider than the global rule: when an earlier PR in the slice touched the same **package**,
  schema or doc section, the code reviewer's task names that PR and asks for the combined behaviour.

## Review lens: UX

Read first by the global `review-ux` persona. Report in English.

- **What runs:** the Studio — the semantic Top View viewer, the layout editor and log replay.
- **Previews:** `branch` and `main`, each on its own host (`http://<label>.localhost:<port>`), both serving synthetic
  fixtures. There is no login and no backend; no persona or role switch.
- **Viewport:** about 1440 wide; check one narrow width only when the task touches layout.
- **Authority:**
  - root `AGENTS.md` (evidence labels, geometry vs connectivity, unknowns) and `README.md` boundaries;
  - `docs/VIEWS.md` → screen modes (Focus: Top View · Gantt · Occurrence list sharing one cursor; Aggregate;
    Journey), `docs/ONBOARDING.md` → Mapping Board flow and keyboard model, and `docs/DELIVERY-PLAN.md` acceptance
    tests;
  - `docs/REPLAY-CONTRACT.md` for what replay may and may not show; `docs/DELIVERY-PLAN.md` Fidelity Tiers (F0–F3);
  - visual style: semi-flat technical schematic, restrained outlines and fills, no fake 3D; theme tokens, not raw
    colours (platform tokens are injected only by the adapter);
  - generic lenses only where the project is silent: `.claude/skills/impeccable/reference/critique.md` (heuristics)
    and `.claude/skills/impeccable/reference/audit.md` (accessibility).
- **Project checks:**
  - **Evidence honesty (blocker class):** every replayed state shows its fidelity (`observed`, `derived`,
    `illustrative`, `unknown`); illustrative motion is visibly distinct and off by default; nothing animates a
    wafer, robot or path the fixture's events do not support; unmapped aliases appear in an unknown list, not on the
    diagram.
  - **Uncertainty:** unknown kinematics, dimensions (`not to scale`) and hidden parts are shown as unknown, not drawn
    as fact.
  - **Selection and sync:** selecting a component, port, level or holding site updates the detail slot; timeline and
    event grid stay in sync on seek, play and click; multi-level components are individually selectable.
  - **States:** empty layout, no events, unmapped events, very long names, many components or events.
  - **Keyboard:** arrow-key or zoom controls where the brief defines them.
  - **Editor (when touched):** undo/redo, snap, move/rotate keep stable IDs and ports; publish shows a change
    preview.
  - **Evidence:** SVG DOMs are large — read only the values you need with `page.evaluate(...)`.
- **Severity examples:** `blocker` includes the wrong component or state shown, or inferred motion presented as
  observed.

## Review lens: quality

Read first by the global `review-quality` persona. Report in English.

- **Range:** the slice start commit `..origin/develop` (the tip the release PR will ship), in a disposable worktree
  detached at `origin/develop`.
- **Authority:** root `AGENTS.md` (Architecture constraints, Change quality gates, Integration rules); `GLOSSARY.md`,
  `docs/DESIGN-v0.4.md` (domain model), `docs/REPLAY-CONTRACT.md`, `docs/INTEGRATION.md`, ADRs under `docs/adr/`,
  and nested `AGENTS.md` files on touched paths. A section marked **Proposed** is design, not a contract the code
  must already meet; flag code that contradicts it, not code that has not built it yet.
- **Boundary leaks:** `@ap/*`, analytics-platform or parser imports outside `packages/platform-adapter`; platform
  concerns (auth, scope, menus, permissions, routing) inside core, renderer, editor or replay; renderer or editor
  owning domain rules that belong in `packages/core`; replay depending on renderer or editor, or core depending on
  any of them.
- **Invariants:** meaning read back out of SVG geometry instead of structured data; connectivity, ports or
  trajectories inferred from adjacency; arm and blade counts coupled, or unknown kinematics, units or stacking
  filled with defaults; fidelity labels missing, or interpolation that can surface as `observed`; non-deterministic
  reducer code (clock, randomness, I/O, iteration order of unordered maps).
- **Test liability, project cases:** brittle snapshots of whole SVGs where a semantic assertion would do; fixtures
  that are not synthetic or that encode one OEM's layout.
- **Doc drift, project cases:** a design doc, contract or README package status.
- **release-blocker:** a domain-invariant or package-boundary violation that would ship wrong evidence, wrong state
  or a platform dependency.

## Fold scope

Files in the issue's diff or the same package; never another package. No format, schema or ADR change. Reducer,
mapping-flatten, undo or lifecycle code only when the file is already in the diff and the issue gets the fix-diff
check.

## Slice close

- `review-quality` range: slice start (or the previous release merge)`...origin/develop`.
- When the slice changed the Studio, the `review-ux` walkthrough runs on previews of `origin/main` and
  `origin/develop`.
- Release gate: `scripts/release-gate.sh "$EV_MAIN"` on a clean checkout at `origin/develop`. On success it prints
  the `gh pr create --base main --head develop` command; open the release PR. The user merges it (merge commit) and
  owns any tag; the conductor merges only with explicit approval in the session (`gh pr merge <n> --merge`).

## Tools

| Tool | What it does | Tests |
| --- | --- | --- |
| `scripts/launch-worker.sh <n> <slug>` | Launch above | – |
| `scripts/verify.sh <worktree>` | Verify step 1; logs in `$WAVE_STATE/verify-<basename>/` | – |
| `scripts/release-gate.sh <checkout>` | fetches `develop`/`main`, requires a clean checkout at `origin/develop`, runs the gate, prints the release PR command without creating or merging it | – |
| `scripts/asset-check.py <checkout> [paths...]` | JSON duplicate keys and validity; SVG well-formedness, `viewBox`, unique ids, no `<script>`/`<foreignObject>`/`on*=`/`javascript:`/external `href` | `test-asset-check.py` |
| `scripts/review-plan.py` | Review plan; refuses uncommitted changes | `test-review-plan.py` |
| `scripts/worker-hygiene.sh <worktree>` | new suppressions fail; whitespace churn is reported (`HYGIENE_BASE`, default `origin/develop`) | `test-worker-hygiene.py` |
| `scripts/wave-status.py [--json] [--prs] [--state-dir <dir>]` | read-only snapshot of workers, previews, worktrees, containers and open PRs; reads `$WAVE_STATE` or every recent session `wave/` dir of this repo | `test-wave-status.py` |
| `templates/brief-check.md` | brief self-check and brief-check items | – |
| `ls docs/adr` | next ADR number (check open branches too) | – |

Run the tests with `python3 .claude/conductor/scripts/test-<name>.py`; CI does not run them.

### Not yet ported

FeedbackOps tooling with no target here yet: visual baselines (`visual.sh`, `baseline-keep.py`,
`capture.visual.spec.ts.tmpl`), UI performance (`nav-perf.*`, `review-perf`, `review-rules-perf.md`), previews
(`app-preview.py`, `preview-fixtures.mjs`), `biome-cmp.sh`, and the backend/DB path (`verify-be.sh`, `verify-db.sh`,
`impl-rules-be.md`, throwaway Postgres). Port after S8 (#13) when `apps/studio` exists; previews will use the vite dev
server, and a perf role is added only once the Studio has a measured interaction budget.

## Traps

- Reviewer tasks say "do not run pnpm": a codex reviewer's `pnpm` in a review worktree auto-installs a repo-local
  `.pnpm-store/`, which makes `orca worktree rm` refuse; in `$EV_MAIN`, trashing that store broke `node_modules`
  links (reinstall with `--config.confirmModulesPurge=false`).
- Packages built with `tsc` need `.js` relative import specifiers, or `dist` fails under Node ESM.
- `orca worktree create --issue` accepts only numbers; launch split issues (11a/11b) under the plain number and
  archive the earlier brief and state.
