# Conductor profile — equipment-visualization

Repo specifics for the global `issue-wave-conductor` skill (`~/.agents/skills/issue-wave-conductor/SKILL.md`, #46).
The loop, roles, state, shared traps and dated history live there; this file holds only what differs here. Root
`AGENTS.md` wins over both. `$CONDUCTOR` is this folder (`.claude/conductor/`).

Differences from the FeedbackOps original: no backend or database, and the repo is standalone (AGENTS.md).

## Flow

- `<base>` is `develop` (user decision 2026-10-14). Each issue gets `feature/<n>-<slug>` from `origin/develop` and a
  PR to `develop`. A finished slice goes `develop` → `main` through a release PR after `$CONDUCTOR/scripts/release-gate.sh`; the
  **user** merges it, always as a merge commit. Never merge to `main`.
- Shared `ship-pr.sh` refuses base `main` by default; `workerops.protectedBases` is unset in this clone, keep it so.
- `$MAIN` is `EV_MAIN` (`~/orca/projects/equipment-visualization`). Orca chooses the worktree location; the launcher
  finds it by name.
- `WAVE_BRIEFS` is `$EV_MAIN/.review/wave/` (`.review/` is gitignored).
- **Merge grant (asked once in the slice-start round, re-asked each session):** the recommended option is "merge into
  `develop` on green CI and review, report afterwards" (사후보고). Other shapes the owner has used: a pre-merge report
  and go-ahead per PR, and "artifact before merge" for screen-changing PRs. Every shape ends at `develop`.
- **Owner decisions (standing):** merges into `develop` are allowed under the grant, but the release (`develop` →
  `main`) waits for the owner's confirmation; a new `@eqv/ui` component is applied to screens only after an astra
  (`review-ux`) review confirms it belongs to the same design system (ADR-0008).
- **Slice start:** separate **Proposed** design from what is implemented. Owner decisions include
  `docs/DELIVERY-PLAN.md` checklist items and format/ADR approval.
- **Slice order:** the dependency order in the slice issues (#5 → #6 → {#7, #8, #9} → {#10, #11, #12} → …) and
  `docs/DELIVERY-PLAN.md`: schema/core before viewer, mapping before Onboarding, reducer before Focus UI. A breaking
  format change needs its ADR merged first (or in the same PR).

## Launch

- `$ENGINE` = `~/.agents/skills/issue-wave-conductor/scripts` (global engines). This repo's rules live in
  `.claude/conductor/conductor.json` + `addenda/`; the engine tests live in the provider repo
  (`~/orca/projects/conductor-engine`), not here.
- `python3 $ENGINE/launch-worker.py <n> <slug>` (reads `conductor.json`):
  - creates an Orca worktree from `origin/develop` and renames its branch to `feature/<n>-<slug>`;
  - builds `.review/00-IMPL-RULES.md` and `.review/00-REVIEW-RULES.md` from the shared templates plus `addenda/` and writes `.review/W-<n>-TASK.md`
    (the rules pointer, then `$WAVE_BRIEFS/<n>-task.md`);
  - initialises submodules (`external/feedbackops`, ADR-0008), closes setup shells, runs `pnpm install
    --frozen-lockfile` when a lockfile exists, applies `PRE_ADD`;
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

1. `$CONDUCTOR/scripts/verify.sh <worktree>` (needs `WAVE_STATE`): root `lint`, `typecheck`, `test`, `build` when defined, the
   package-boundary check, `asset-check.py` and `$ENGINE/worker-hygiene.py`; prints a summary.
2. **Replay changes:** tests exist for each replay case the brief listed (ties, open occurrences, Data Quality
   Issues, Time Anomalies, Watermark and Binding boundaries, invalid mappings, duplicate occupancy, evidence
   fidelity); run the reducer suite twice, a different result is a determinism failure.
3. **Mapping changes:** the same Alias Rules produce the same Mapping Version hash on a second run.
4. **Asset/schema changes:** `asset-check.py` covers structure and SVG safety; port endpoints, levels and hierarchy
   cycles are covered by `packages/core`'s validator through `test`.

## Browser evidence

Previews are started by hand; there is no preview script (porting `app-preview.py` is #91).

- **Branch:** in the issue worktree, `EQV_STUDIO_ASSETS=<scratch copy of assets/> pnpm dev --port <free> --strictPort`
  (the root `dev` script builds the Studio's workspace dependencies, then runs vite). Use fixed free ports per wave
  (5191–5199 so far) and pass the URLs to the reviewer.
- **Baseline:** the same command in the wave baseline worktree detached at `origin/develop` (install: `pnpm install
  --frozen-lockfile`; refresh with `git -C <baseline> checkout --detach origin/develop`).
- **Data root:** `EQV_STUDIO_ASSETS` points each preview at its own copy of `assets/` outside this repository, so a save,
  publish or import in the preview never writes the checkout (`apps/studio/README.md`; imports into a root inside the
  repo are refused).
- Captures go to `.review/<n>-shots/`. Stop both dev servers in the turn the UX review ends.

## Review

- Plan: `python3 $ENGINE/review-plan.py <checkout> --config .claude/conductor/conductor.json [--base origin/develop] [--head HEAD]`;
  rules in `conductor.json` `review_plan`. Docs-only changes get no roles.
- Flags go into every reviewer task: `boundary` (check the package boundary first), `replay`, `schema` (and
  `schema_without_adr`), `instructions` (`.claude/**`, `skills/**`, `AGENTS.md`, `CLAUDE.md`; global step 7a).
- Rules: `review-final` → shared `review-rules.md` + `addenda/review-rules.md`, built to `.review/00-REVIEW-RULES.md`; `review-ux` →
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
- **Write scope:** do not press save, publish or import in a Studio preview unless the task says the preview runs on
  a throwaway `EQV_STUDIO_ASSETS` copy. A preview without that variable writes the reviewed checkout's `assets/`:
  after the review the conductor restores it (`git checkout -- assets`, trash untracked files under `assets/`)
  before any commit, and resets a polluted preview data copy before the next run (2026-10-18).
- **Viewport:** about 1440 wide; check one narrow width only when the task touches layout.
- **Authority:**
  - root `AGENTS.md` (evidence labels, geometry vs connectivity, unknowns) and `README.md` boundaries;
  - `docs/VIEWS.md` → screen modes (Focus: Top View · Gantt · Occurrence list sharing one cursor; Aggregate;
    Journey), `docs/ONBOARDING.md` → Mapping Board flow and keyboard model, and `docs/DELIVERY-PLAN.md` acceptance
    tests;
  - `docs/REPLAY-CONTRACT.md` for what replay may and may not show; `docs/DELIVERY-PLAN.md` Fidelity Tiers (F0–F3);
  - visual style: semi-flat technical schematic, restrained outlines and fills, no fake 3D; theme tokens, not raw
    colours;
  - design system (ADR-0008): every screen, the standalone Studio included, must look like analytics-platform —
    FeedbackOps `@fops/ui` controls and tokens, the platform shell (rail, sidebar, 50px page head, 32px table rows).
    Compare side by side with the analytics-platform screen of the same kind; a default browser control or an
    unstyled table is a finding, not a nit;
  - generic lenses only where the project is silent: the globally installed `impeccable` skill's
    `~/.agents/skills/impeccable/reference/critique.md` (heuristics) and `reference/audit.md` (accessibility).
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

- **Range:** slice start (or the previous release merge)`...origin/develop` (the tip the release PR will ship), in a
  disposable worktree detached at `origin/develop`; the same range as § Slice close.
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

## Deferrals

- The record is one open grouped issue per slice, titled `[<Area>] Deferred items (<slice issues>)` with the
  `needs-triage` label; the Studio slice (#13–#15) uses #60. There is no backlog doc.
- One table row per item: `Item | Source | Reason | Reopen when`. Source names the review finding ID and PR, or the
  issue decision. Every row is **not implemented**. Edit the issue body (`gh issue edit <n> --body-file`) so the
  table stays one table; append all of a PR's rows in one edit.
- At slice close, file each row that met its reopen condition, and move the rest to the next slice's issue. Close
  the grouped issue when it has no rows left.

## Slice close

- `review-quality` range: slice start (or the previous release merge)`...origin/develop`.
- When the slice changed the Studio, the `review-ux` walkthrough runs on previews of `origin/main` and
  `origin/develop`.
- Release gate: `$CONDUCTOR/scripts/release-gate.sh "$EV_MAIN"` on a clean checkout at `origin/develop`. On success it prints
  the `gh pr create --base main --head develop` command; open the release PR. The user merges it (merge commit) and
  owns any tag; the conductor merges only with explicit approval in the session (`gh pr merge <n> --merge`).

## Tools

Provided pieces (the `issue-wave-conductor` skill with its engines and templates, `orca-dispatch-recipes`,
`session-handoff`, the reviewer personas, the workflow hooks) are installed by the provider repo
`~/orca/projects/conductor-engine` with `bash install.sh`; this repo keeps only `$CONDUCTOR`. The SessionStart
context names the installed commit; when it warns about edited installed copies, run `bash install.sh --check` in the
provider checkout. A defect in a provided piece is filed with `$ENGINE/upstream-file.sh` (global § Deferrals →
Upstream), and a local workaround goes in § Traps with the issue link.

| Tool | What it does | Tests |
| --- | --- | --- |
| `$ENGINE/launch-worker.py <n> <slug>` | Launch above | – |
| `$CONDUCTOR/scripts/verify.sh <worktree>` | Verify step 1; logs in `$WAVE_STATE/verify-<basename>/` | – |
| `$CONDUCTOR/scripts/release-gate.sh <checkout>` | fetches `develop`/`main`, requires a clean checkout at `origin/develop`, runs the gate, prints the release PR command without creating or merging it | – |
| `$CONDUCTOR/scripts/asset-check.py <checkout> [paths...]` | JSON duplicate keys and validity; SVG well-formedness, `viewBox`, unique ids, no `<script>`/`<foreignObject>`/`on*=`/`javascript:`/external `href` | `test-asset-check.py` |
| `$ENGINE/review-plan.py` | Review plan; refuses uncommitted changes | engine repo |
| `$ENGINE/worker-hygiene.py <worktree>` | new suppressions fail; whitespace churn is reported (base `origin/develop`, from `conductor.json`) | engine repo |
| `$ENGINE/wave-status.py [--json] [--prs] [--state-dir <dir>]` | read-only snapshot of workers, previews, worktrees, containers and open PRs; reads `$WAVE_STATE` or every recent session `wave/` dir of this repo | engine repo |
| `addenda/brief-check.md` | EV items for the shared brief self-check (`templates/brief-check.md` in the skill) | – |
| `ls docs/adr` | next ADR number (check open branches too) | – |

Run `asset-check.py`'s test with `python3 .claude/conductor/scripts/test-asset-check.py`; CI does not run it. Engine tests are in the engine repo.

### Not yet ported

FeedbackOps tooling with no target here yet: visual baselines (`visual.sh`, `baseline-keep.py`,
`capture.visual.spec.ts.tmpl`), UI performance (`nav-perf.*`, `review-perf`, `review-rules-perf.md`), the preview
script (`app-preview.py`, `preview-fixtures.mjs`; tracked in #91, previews run by hand per § Browser evidence),
`biome-cmp.sh`, and the backend/DB path (`verify-be.sh`, `verify-db.sh`, `impl-rules-be.md`, throwaway Postgres). A
perf role is added only once the Studio has a measured interaction budget.

## Traps

- Reviewer tasks say "do not run pnpm": a codex reviewer's `pnpm` in a review worktree auto-installs a repo-local
  `.pnpm-store/`, which makes `orca worktree rm` refuse; in `$EV_MAIN`, trashing that store broke `node_modules`
  links (reinstall with `--config.confirmModulesPurge=false`). The `review-quality` persona lacks this rule
  (hjung3113/conductor-engine#22), so its task says it too.
- Packages built with `tsc` need `.js` relative import specifiers, or `dist` fails under Node ESM.
- A worktree created by hand (`orca worktree create`, `git worktree add`) has no submodules: run `git submodule update
  --init` before `pnpm install`, or Studio cannot resolve `@fops/ui` (2026-10-18).
- A lettered slice (73e, 73f2) launches with its suffixed id, `launch-worker.py 73f2 <slug>`: the launcher reads
  `$WAVE_BRIEFS/73f2-task.md`, names the report, sentinel and state `W-73f2`, and passes only the digits to `orca
  worktree create --issue` (which accepts only numbers). Launching with the plain number picked an older slice's
  brief (2026-10-18). Keep `--brief` for a brief stored under another file name; it does not change the report or
  sentinel names.
- A new package cannot receive `PRE_ADD` dependencies: create the worktree by hand, commit a scaffold
  (`package.json`, tsconfigs, pinned deps), then launch with the shared `worker-launch.sh`
  (hjung3113/conductor-engine#23).
- A merge of a change that loads ESLint/Tailwind inside the parallel test run pushed an unrelated 5 s editor test
  over its timeout in CI twice: read the CI timings of the slowest tests in other packages before merging such a
  change (2026-10-18; hjung3113/conductor-engine#20).
- A worktree with the submodule initialised cannot be removed: `orca worktree rm` returns `ok` but leaves the directory,
  and `git worktree remove` refuses ("working trees containing submodules"). Archive `.review/`, confirm `git status
  --porcelain` is empty, then `trash <wt>`, `git worktree prune`, `git branch -D <branch>`; do not rely on `ship-pr.sh
  --worktree` cleanup (2026-10-19; hjung3113/conductor-engine#27).
- End the conductor's own browser-evidence scripts with `await task.finish({ keep: [] })` before any reviewer probe or
  launch: in the demo slice the step-7d probe hung three times out of three right after a conductor script that left its
  task space open, and a kill + reopen of Ego Lite fixed it each time (cause unconfirmed; 2026-10-20;
  hjung3113/conductor-engine#47).
- Ego Lite cannot time paint or frame rate: while its agent window is occluded, requestAnimationFrame fires about once per
  second (`Page.bringToFront` does not help), so click-to-paint and playback-fps numbers taken there are wrong. Time paint
  in headless Chromium (a throwaway Playwright script against the preview) and say so in VERIFY; Ego Lite stays the tool
  for interaction, focus and screenshots (#129, 2026-10-19; hjung3113/conductor-engine#39).
- `launch-worker.py` copies only the brief and the rules into the worktree's `.review/`. Copy every other `.review/`
  file the brief names (an inventory, an audit) before launching, or the worker works without it (#73 f2c, 2026-10-19;
  hjung3113/conductor-engine#28).
