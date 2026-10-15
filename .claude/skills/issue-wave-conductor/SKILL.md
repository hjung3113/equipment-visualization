---
name: issue-wave-conductor
description: Conduct a wave of equipment-visualization GitHub issues to PRs on develop, one issue = one branch = one PR, with codex/omp workers implementing, role-split reviewers chosen per issue by trigger (code always; UX when the Studio or SVG output changes; code quality once per slice) using the shared routing table, and the conductor verifying on the host; a finished slice goes develop → main through a release PR the user merges. Covers brief writing, launch, watching, host verification against the AGENTS.md quality gates, review, ship, slice close and cleanup. Use when the user says "wave 진행", "이슈들 진행해", "다음 이슈", or asks to work through the slice issues (#5–#15) or the M0/M1/M2 epics (#1–#3) with workers.
---

# Issue wave conductor

The conductor never writes product code beyond mechanical fixes; workers implement, reviewers judge, the conductor
verifies, commits and ships. Adapted from the FeedbackOps conductor: same git flow (`develop` for issues, `main` for
releases), but no backend or database, and the repo is standalone (AGENTS.md). Evidence for the inherited rules
(dated incidents and measurements): `~/Desktop/2026/FeedbackOps/.claude/skills/issue-wave-conductor/references/history.md`.

**Git flow and merging (user decision 2026-10-14).** Each issue gets `feature/<n>-<slug>` from `origin/develop` and a
PR to `develop`. When a slice is done, a `develop` → `main` release PR is opened after `scripts/release-gate.sh`; the
**user** merges it, always as a merge commit. Before starting, establish whether auto-merge to `develop` is authorized
**this session**; without that grant, ship an open PR and leave merging to the user. Never merge to `main`: the shared
`ship-pr.sh` refuses it by default (`workerops.protectedBases` is unset in this clone; keep it so).

## Roles and routing

Read `~/.claude/skills/orca-dispatch-recipes/routing.tsv` for the current roles, runtimes, models and efforts, and
load the `orca-dispatch-recipes` skill before the first launch. The user's session overrides win; pass them with
`worker-launch.sh --model/--effort` instead of duplicating defaults here. Shared scripts live in
`~/.claude/skills/orca-dispatch-recipes/scripts/`: `worker-launch.sh`, `worker-wait.sh`, `ship-pr.sh`. They must be
installed before dispatch.

- `scripts/launch-worker.sh` prepares the worktree and launches implementation (role `impl` by default).
- Shared `worker-launch.sh` directly launches `fix`, every reviewer role (`review-final`, `review-ux`,
  `review-quality`) and intermediate `review-check`.
- codex roles run in an Orca terminal; `claude` roles run as background `claude -p` with the prompt on stdin, plus
  `--agent <role>` when `.claude/agents/<role>.md` exists in the cwd (routing `--model`/`--effort` override its
  frontmatter).
- Implementation workers run in an Orca terminal so the user can watch them (`impl` via omp; `impl-luna` on a quota
  stop); `impl-complex` and `impl-mid` use whatever runtime `routing.tsv` names. Code and slice-quality reviewers run
  as codex, the UX reviewer as background `claude -p --agent review-ux` (no terminal).
- **Conductor chores go to role `research`** (background codex): screenshots and captures, simple research, doc
  synthesis, read-only `gh` queries. The conductor keeps its context for decisions and verification.
- A report sentinel alone is not completion: `worker-wait.sh` also checks freshness, the last non-empty line and
  worker exit or terminal idleness. Close a finished worker's terminal at once; keep its state JSON for the report and
  later cleanup.

## State

- `WAVE_STATE` — the session scratchpad `wave/` dir: worker state JSON (`W-<n>.json`, `W-<n>-FIX<k>.json`,
  `W-<n>-FINAL.json`, `W-<n>-UX.json`, `W-<n>-CHECK<k>.json`, `SLICE-<m>-QUALITY.json`) and `verify-<worktree>/` logs.
  Pass `--state-dir "$WAVE_STATE"` on every launch and wait; give every round distinct names and reports.
- `WAVE_BRIEFS` — brief dir, `.review/wave/` (gitignored). `EV_MAIN` — the main checkout
  (`~/orca/projects/equipment-visualization`).

## Slice start

1. Read every candidate issue for the slice and the docs AGENTS.md requires (`README.md`, `GLOSSARY.md`,
   `docs/DESIGN-v0.4.md`, `docs/REPLAY-CONTRACT.md`, `docs/ONBOARDING.md`, `docs/VIEWS.md`, `docs/INTEGRATION.md`,
   `docs/adr/`). Separate **Proposed** design from what is implemented.
2. Collect every decision only the owner can make (format/ADR approval, `DELIVERY-PLAN.md` checklist items, scope,
   test deletion, any external service the slice would call) and ask them in **one** `AskUserQuestion` round, each
   with a recommended option; record the answers on the issues. A decision that surfaces later is still asked at
   once, but plan for none. **Mid-wave, ask in plain text, never `AskUserQuestion`:** it blocks the conductor until the
   owner answers. Keep every issue the question does not gate moving, and fold the answer in when it arrives.
3. **Value gate.** Before an issue enters a slice, and before any finding is folded or filed, weigh the user's gain
   against the maintenance it adds (new state, timing workarounds, spread ownership, extra tests). Proceed anyway
   for a correctness or evidence-trust defect (wrong state shown, interpolation labelled `observed`, a boundary
   leak) or a clearly larger UX gain. Say which applies in the brief's first line; drop or close the rest with the
   owner's approval.
4. **Choosing the slice.** The next slice comes from owner priorities and the dependency order in the slice issues
   (#5 → #6 → {#7, #8, #9} → {#10, #11, #12} → …), not by default from the previous slice's review follow-ups. Review
   follow-ups wait for a **polish slice**, run when the owner asks or an area has collected several.
5. **Order** follows `docs/DELIVERY-PLAN.md`: schema/core before viewer, mapping before Onboarding, reducer before
   Focus UI. Breaking format changes need their ADR merged (or in the same PR) first.

## Loop per issue

1. **Brief** (`$WAVE_BRIEFS/<n>-task.md`): re-verify every fact on current `origin/develop` (paths, types, doc
   sections, existing helpers) — issue text goes stale. Sections: *Facts (verified on develop)* / *Do* / *Invariants
   that apply* / *Acceptance (tests)* / sentinel line. Name what to reuse, what is out of scope, and conductor
   decisions as "final — do not re-litigate". Search merged PR bodies for earlier notes on the touched area
   (`gh pr list --state merged --search "\"Noted, not filed\" <package or doc>"`) and put the matching ones into *Do*
   (they fold under 7d's rules); a note seen a second time is filed. End with
   `Sentinel (last line of .review/W-<n>-REPORT.md): <!-- W-<n>-DONE -->` — the launcher registers exactly that.
   Check `ls docs/adr` before assigning an ADR number (parallel issues collide).
   **Self-check before launch:** walk `templates/brief-check.md` yourself; every item there cost a review round.
   **Brief check.** Before launching an `impl-complex` or `impl-mid` brief, have it checked: task
   `$WAVE_BRIEFS/<n>-BRIEFCHECK-TASK.md` naming the brief, the template, the report path and
   `<!-- W-<n>-BRIEFCHECK-DONE -->`, launched with `worker-launch.sh --role review-check --cwd "$EV_MAIN"` while the
   main checkout is clean at `origin/develop`. If Orca refuses that checkout, use `--role impl-fallback --model
   gpt-6.1-sol --effort medium` (background, no terminal). Fold the findings into the brief, then launch. Mechanical
   `impl` briefs skip it.
2. **Launch:** `scripts/launch-worker.sh <n> <slug>` (≈5–7 in flight is the sustainable ceiling for one conductor; 2–3
   when the conductor also runs every browser check). It delegates to shared `worker-launch.sh` with role `impl`; set
   `WORKER_ROLE` to change the role and optionally `WORKER_MODEL` / `WORKER_EFFORT` for overrides. Parallelise only
   issues that touch disjoint files. Workers have no network: when a brief adds a dependency, set
   `PRE_ADD='<pnpm filter> <pkg@exact> [...]'` so the launcher installs it (lockfile included) before the worker
   starts, and say so in the brief.
   **Complex issues go to `WORKER_ROLE=impl-complex`** (model in `routing.tsv`), and so do their fix rounds: pass
   `--role impl-complex` instead of `fix`. An issue is complex when any of these hold:
   - it changes the replay reducer, `Seek(t)`, Record Sequence ordering, Time Anomaly handling or facet evidence
     derivation (ADR-0002, ADR-0003);
   - it changes mapping semantics: Alias Rule precedence, Mapping Scope flattening, Mapping Version hashing or
     Binding resolution (ADR-0005);
   - it changes a format or schema together with its consumers, or needs a new ADR;
   - it touches the package boundary or `packages/platform-adapter`, or touches three or more packages;
   - it carries ordering, determinism or state logic: undo/redo, publish revisions, the Mapping Board state, Template
     matching tie-breaks;
   - an earlier GLM round on the same issue failed or needed a second fix round.
   **Small issues that still need judgment go to `WORKER_ROLE=impl-mid`** (model in `routing.tsv`), and so do their
   fix rounds: single-component behaviour fixes, accessibility or layout corrections, and doc-versus-code
   reconciliations, where the brief cannot spell out every line.
   Mechanical briefs (renames, constants, fully specified edits) use `impl`. Record the choice and the reason in
   `W-<n>-VERIFY.md`.
3. **Wait:** shared `worker-wait.sh --state "$WAVE_STATE/W-<n>.json" --timeout 3600 --poll 30`, always with the Bash
   tool's `run_in_background` — the harness wakes the conductor when it exits. Never poll in the foreground or with
   `until`/`sleep` loops: each foreground wait re-reads the whole conversation. `scripts/wave-status.py` (or the
   `/wave` pane) shows every worker at a glance.
   For several workers pass repeated `--state` options and `--any`, then **read the returned `name` before acting**
   (a result can belong to another worker) and remove that worker from the pending set before waiting again. Act on
   both the final JSON and the exit code:
   - `0` done → verify on the host and close any terminal immediately;
   - `10` failed → read the result's `log_tail` first, then the report/log, and write a repair brief;
   - `11` quota (including a grok API 402) → stop the stalled worker, then relaunch **in the same worktree** with shared
     `worker-launch.sh --role impl-luna` (not `launch-worker.sh`, which creates a new worktree) and a task that says
     the worktree holds partial edits (standing user decision);
   - `12` timeout → inspect progress; do not treat it as completion or launch a duplicate;
   - `2` usage → correct the arguments.
   Do not consume a stale report or a sentinel written before the worker stops.
4. **Verify on the host** (workers already ran their touched tests + typecheck per `templates/impl-rules.md`):
   `scripts/verify.sh <worktree>` (needs `WAVE_STATE`). It runs the root `lint`, `typecheck`, `test` and `build`
   scripts when defined, the package-boundary check, `asset-check.py` and `worker-hygiene.sh`, and prints a summary.
   Then:
   - **Replay changes:** confirm tests exist for each replay case the brief listed (ties, open occurrences, Data
     Quality Issues, Time Anomalies, Watermark and Binding boundaries, invalid mappings, duplicate occupancy,
     evidence fidelity), and run the reducer suite twice — a different result is a determinism failure.
   - **Mapping changes:** the same Alias Rules must produce the same Mapping Version hash on a second run.
   - **Asset/schema changes:** `asset-check.py` covers structure and SVG safety; port endpoints, levels and hierarchy
     cycles are checked by `packages/core`'s validator through `test` once it exists (#6). Until then, check them by
     reading the JSON and record that in VERIFY.
   - Mutation-check new tests once (break the fix, see the named test fail, restore).
   - Commit with the issue number, then run `python3 scripts/review-plan.py <worktree>`.
5. **Fix it yourself only if mechanical** (import order, a fixture typo, a test expectation that pinned removed
   behaviour). Record each in `.review/W-<n>-VERIFY.md`. Anything with judgment → a fix brief
   (`.review/W-<n>-FIX<k>-TASK.md`) with the host output quoted, launched with shared `worker-launch.sh --role fix
   --cwd <worktree> --task <abs> --report <abs> --sentinel '<sentinel>' --name W-<n>-FIX<k> --state-dir "$WAVE_STATE"`
   (`--role impl-complex` or `impl-mid` when the issue was routed there). Name the implementation rules in the brief;
   wait on the state JSON as in step 3 before verifying.
6. **Browser evidence for UI** (once `apps/studio` exists): start the Studio dev server from the worktree's root
   `dev` script on a free port, bound to `<label>.localhost`, and a second one from a baseline worktree detached at
   `origin/develop` (`git worktree add --detach <wave>/baseline origin/develop`, then
   `pnpm install --frozen-lockfile`; refresh with `git -C <wave>/baseline checkout --detach origin/develop`; never
   `$EV_MAIN`). Rebase the branch onto `origin/develop` first so the merge-base is the develop tip. Capture screenshots
   with the `ego-browser` skill (or hand the capture to role `research`) into `.review/<n>-shots/`. Stop both servers
   in the same turn they are no longer needed.
7. **Role-split review, chosen by trigger.** Run host verification and captures **first**.

   **a. Plan.** Record the `review-plan.py` output in VERIFY. `code` → `review-final`. `ux: required` → `review-ux`.
   `ux: optional` → the conductor decides and records a one-line reason. Flags go into every reviewer task:
   `boundary` (check the package boundary first), `replay`, `schema` (and `schema_without_adr`), `instructions`
   (read the branch's `.claude/**`, `skills/**`, `AGENTS.md`, `CLAUDE.md` diff yourself before launching anyone;
   reviewers load those files from the branch).

   | Role | Task / report / sentinel | Rules |
   |---|---|---|
   | `review-final` | `W-<n>-FINAL-TASK.md` / `-FINAL-REPORT.md` / `<!-- W-<n>-FINAL-DONE -->` | `templates/review-rules.md` → `.review/00-REVIEW-RULES.md` |
   | `review-ux` | `W-<n>-UX-TASK.md` / `-UX-REPORT.md` / `<!-- W-<n>-UX-DONE -->` | `.claude/agents/review-ux.md` (`--agent`) |
   | `review-quality` | `SLICE-<m>-QUALITY-TASK.md` / `-QUALITY-REPORT.md` / `<!-- SLICE-<m>-QUALITY-DONE -->` | `.claude/agents/review-quality.md` |

   **b. Launch the code reviewer at once**; it needs no preview. Launch `review-ux` with the branch and baseline
   preview URLs, at most three scenarios from the brief, and an absolute screenshot directory you create first.
   **At most one claude reviewer runs at a time** (shared quota); with several screen issues in flight, UX reviews
   queue. Every role: shared `worker-launch.sh --role <role> --cwd <worktree> --task <abs> --report <abs> --sentinel
   '<sentinel>' --name <name> --state-dir "$WAVE_STATE"`.

   **c. Wait, with reviewer exit codes.** `worker-wait.sh --any --kill-on-timeout` (`--timeout 5400` for UX, 3600
   otherwise). `0`: read the report. `10`: use a partial report if one exists, else relaunch once; after a second
   failure record the gap. `11`: wait for the reset or skip the role and record why in VERIFY and the PR body. `12`:
   the process group is already killed; treat it like `10`.
   **Tripwire:** record `git rev-parse HEAD`, `git status --porcelain` and `git stash list | wc -l` in the worktree
   and in `$EV_MAIN` before reviewer launch, and compare after (`ego-browser` runs arbitrary Node).

   **d. Merge findings.** Drop duplicates; resolve conflicts in this order: AGENTS.md invariants (boundary, evidence
   fidelity, geometry ≠ connectivity, unknown stays unknown) → ADRs and recorded owner decisions → correctness and
   contracts → the brief → UX on the shipped pattern → style. A finding that contradicts the brief or is really a
   product question goes to the owner (an **Owner questions** section in the PR body and a `needs-triage` issue);
   hold the merge if it is a `blocker`. Owner decisions marked final are never reversed in a fix round; only evidence
   that one causes a blocker goes up.
   - **Pre-existing or out-of-scope findings — fold, file or note** (value gate first). **Fold** into FIX1 only when
     all hold: (1) no owner decision and no format/schema/ADR change; (2) a defect fix, not a refactor; (3) touches
     only files in the issue's diff or the same package, never another package; (4) ≤30 changed non-test lines per
     item and ≤3 items per issue; (5) a behaviour change carries a regression test that fails without it; (6) not
     reducer, mapping-flatten, undo or lifecycle code unless the file is already in the diff and the issue gets the
     fix-diff check below. Folds never delete tests; each goes into its own FIX1 commit with its finding ID; then run
     `review-plan.py <worktree> --base <pre-fix head>` and revert-and-file a fold that triggers a role the original
     plan did not run. The PR body lists folds under **Also fixed (pre-existing)**. **File** one grouped issue
     otherwise (never one issue per nit). **Note** `minor`/`nit` outside the touched area as one line each under
     **Noted, not filed** in the PR body.
   - Put every kept finding, tagged with its role, into **one** fix brief (`W-<n>-FIX1-TASK.md`). The conductor
     verifies the fix round and ships; there is no second full review.
   - **Fix-diff check for `impl-complex` issues:** FIX1 (folds included) gets one `review-check` on the fix diff; its
     findings go into at most one FIX2, which the conductor reviews directly (diff read, mutation check) with no
     further reviewer and no folds. A re-check reports only whether the fixed finding is fixed and any regression
     against the pre-fix head.

   **e. Rules that still hold:**
   - No review at all for docs-only changes; the plan reports no roles for them.
   - Intermediate checks use role `review-check` with distinct CHECK task, report and state names.
   - When an issue merged earlier in the same slice touched the same package, schema or doc section, the code
     reviewer's task names that PR and asks for the combined behaviour.
8. **Ship:** rerun `verify.sh` after rebasing on `origin/develop`. Shared `ship-pr.sh --branch feature/<n>-<slug>
   --base develop --title '<title>' --body-file <file> --ci --ci-timeout 3600` (body: change, review verdicts with
   applied and deferred findings, verification table, unrun checks stated honestly). The script fetches and rebases
   before pushing; if the pinned head changes after host verification, verify that head before authorizing merge.
   Never use base `main`. Without a merge grant, omit `--merge` and leave the PR open. With one: `SHIP_AUTOMERGE=1`
   and `--merge --issue <n> --close-comment '<verification and outcome>'`. Pass only finished resources via
   `--worktree`/`--terminal`; never pass a worktree still needed for verification, review or user merge, and never
   chain `orca worktree rm` after it. Exit `20` rebase conflict, `21` CI failed, `22` CI timeout, `30`/`31` merge
   refused. Confirm the pinned head before claiming shipped. Close every finished terminal and remove every finished
   worktree.
9. Keep `HANDOFF.md` (repo root, local-only) current every few PRs, updated in place (no dated copies). File only
   owner decisions and 7d "file" items as issues; a flake is filed on its second occurrence; deferred nits are noted,
   not filed.
10. **Slice close (before the release gate).** When the slice's last issue has merged to `develop`:
    - **`review-quality`** in a disposable Orca worktree (`orca worktree create --base-branch origin/develop`, not
      `git worktree add`: it runs in an Orca terminal). The task's first line is "Read
      `.claude/agents/review-quality.md` and follow it as your role definition."; it names the commit range (slice
      start..`origin/develop`), the issues, the report and the sentinel. Act on its classes: `release-blocker` → a
      normal issue loop before the release; `fix-in-slice` → one chore PR to `develop`; `follow-up` → fold, file or
      note (7d). Slice-close folds are limited to copy, a11y attributes, dead code and docs.
    - When the slice changed the Studio, one `review-ux` walkthrough over at most three of the slice's user flows,
      previews of `origin/main` and `origin/develop`.
    - **Delta quality review:** when findings added issues to the slice after the quality review, run one short
      `review-quality` on those files before the release gate.
    - **Release gate:** `scripts/release-gate.sh "$EV_MAIN"` on a clean checkout at `origin/develop`. On success it
      prints the `gh pr create --base main --head develop` command; open the release PR. The user merges it (merge
      commit only); the conductor merges only with explicit approval in the session (`gh pr merge <n> --merge`).
    - **One slice per session.** Once the release PR is open, write the handoff and recommend a fresh session.
    - Before any handoff, no Studio dev server or preview may still be running.

## Tools

- `scripts/launch-worker.sh <n> <slug>` — Orca worktree from `origin/develop` → `feature/<n>-<slug>`, brief and rules
  into `.review/`, install, delegate to `worker-launch.sh`.
- `scripts/verify.sh <worktree>` — host gates (step 4); logs in `$WAVE_STATE/verify-<basename>/`.
- `scripts/release-gate.sh <checkout>` — fetches `develop`/`main`, requires a clean checkout at `origin/develop`,
  runs the gate and prints the release PR command without creating or merging it. Fails clearly while the root
  `package.json` gate scripts do not exist yet (before #5).
- `scripts/asset-check.py <checkout> [paths...]` — JSON duplicate keys and validity; SVG well-formedness, `viewBox`,
  unique ids, no `<script>`/`<foreignObject>`/`on*=`/`javascript:`/external `href`. Tests: `test-asset-check.py`.
- `scripts/review-plan.py <checkout> [--base origin/develop] [--head HEAD]` — step 7a; refuses uncommitted changes.
  Tests: `test-review-plan.py`.
- `scripts/worker-hygiene.sh <worktree>` — new suppressions fail; whitespace churn is reported (`HYGIENE_BASE`,
  default `origin/develop`). Tests: `test-worker-hygiene.py`.
- `scripts/wave-status.py [--json] [--prs] [--state-dir <dir>]` — read-only snapshot of workers, previews,
  worktrees, containers and open PRs; reads `$WAVE_STATE` or every recent session `wave/` dir of this repo. Use it
  when the owner asks for progress. Tests: `test-wave-status.py`.

## Not yet ported

FeedbackOps tooling with no target here yet: visual baselines (`visual.sh`, `baseline-keep.py`,
`capture.visual.spec.ts.tmpl`), UI performance (`nav-perf.*`, `review-perf`, `review-rules-perf.md`), previews
(`app-preview.py`, `preview-fixtures.mjs`), `biome-cmp.sh`, and the backend/DB path (`verify-be.sh`, `verify-db.sh`,
`impl-rules-be.md`, throwaway Postgres). Port after S8 (#13) when `apps/studio` exists; previews will use the vite dev
server, and a perf role is added only once the Studio has a measured interaction budget.

## Traps

- `orca terminal create` accepts only Orca-managed worktrees; a plain `git worktree add` baseline cannot host a
  `codex-orca` reviewer. Run previews there, or launch codex in the background (`--role impl-fallback`).
- If Orca hangs at `runtimeState: starting`, launch with `WORKER_ROLE=impl-fallback` (background `codex exec` with
  stdin from `/dev/null`), which needs no Orca terminal.
- Workers that add helpers to a barrel file break partial `vi.mock` of that barrel; import new helpers from the
  defining module.
- A split into a subfolder breaks relative imports (`../shared` vs `./shared`).
- zsh: never name a variable `path` (tied to `PATH`) or `status` (read-only).
- Rebase conflicts between parallel issues are mostly import lists: keep both sides. A later merge can add a required
  field that an earlier branch's new fixture lacks — typecheck after every rebase.
- A merge that adds dependencies breaks other worktrees' builds until `pnpm install --frozen-lockfile` runs there;
  the main checkout's `node_modules` goes stale the same way — install before the release gate.
- The worktree's own `.review/` is gitignored — copy briefs and rules in; `orca worktree create` may fail to return
  a terminal handle (retry `terminal create`).
