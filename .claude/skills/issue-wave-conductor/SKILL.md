---
name: issue-wave-conductor
description: Conduct a wave of equipment-visualization GitHub issues to PRs on main, one issue = one branch = one PR, with codex/omp workers implementing, role-split reviewers chosen per issue by trigger (code always; UX when the Studio or SVG output changes; code quality once per slice) using the shared routing table, and the conductor verifying on the host. Covers brief writing, launch, watching, host verification against the AGENTS.md quality gates, review, ship and cleanup. Use when the user says "wave 진행", "이슈들 진행해", "다음 이슈", or asks to work through the M0/M1/M2 issues with workers.
---

# Issue wave conductor

The conductor never writes product code beyond mechanical fixes; workers implement, reviewers judge, the conductor
verifies, commits and ships. Adapted from the FeedbackOps conductor: this repo has one long-lived branch (`main`),
no backend or database, and is standalone (AGENTS.md).

**Merging.** Feature PRs target `main`. Ship an open PR and leave merging to the user unless they authorize merges
**this session**. The shared `ship-pr.sh` refuses `--merge` to `main` by default; with the user's grant, run
`git -C "$EV_MAIN" config workerops.protectedBases none` once and set `SHIP_AUTOMERGE=1`.

## Roles and routing

Read `~/.claude/skills/orca-dispatch-recipes/routing.tsv` for the current roles, runtimes, models and efforts, and
load the `orca-dispatch-recipes` skill before the first launch. The user's session overrides win; pass them with
`--model/--effort` instead of duplicating defaults here. Shared scripts live in
`~/.claude/skills/orca-dispatch-recipes/scripts/`: `worker-launch.sh`, `worker-wait.sh`, `ship-pr.sh`.

- `scripts/launch-worker.sh` prepares the worktree and launches implementation (role `impl` by default).
- Shared `worker-launch.sh` directly launches `fix`, every reviewer role (`review-final`, `review-ux`,
  `review-quality`) and intermediate `review-check`.
- codex roles run in an Orca terminal; `claude` roles run as background `claude -p` with the prompt on stdin, plus
  `--agent <role>` when `.claude/agents/<role>.md` exists in the cwd (routing `--model`/`--effort` override its
  frontmatter).
- A report sentinel alone is not completion: `worker-wait.sh` also checks freshness, the last non-empty line and
  worker exit or terminal idleness. Close a finished worker's terminal at once; keep its state JSON.
- `review-perf` and the nav-perf tooling were FeedbackOps-specific and are not carried over. Add a perf role only
  once the Studio has a measured interaction budget.

## State

- `WAVE_STATE` — the session scratchpad `wave/` dir: worker state JSON (`W-<n>.json`, `W-<n>-FIX<k>.json`,
  `W-<n>-FINAL.json`, `W-<n>-UX.json`, `W-<n>-CHECK<k>.json`, `SLICE-<m>-QUALITY.json`) and `verify-<worktree>/` logs.
  Pass `--state-dir "$WAVE_STATE"` on every launch and wait; give every round distinct names and reports.
- `WAVE_BRIEFS` — brief dir, `.review/wave/` (gitignored). `EV_MAIN` — the main checkout
  (`~/orca/projects/equipment-visualization`).

## Slice start

1. Read every candidate issue for the slice and the docs AGENTS.md requires (`README.md`, `docs/DESIGN-v0.3.md`,
   `docs/REPLAY-CONTRACT.md`, `docs/INTEGRATION.md`). Separate **Proposed** design from what is implemented.
2. Collect every decision only the owner can make (format/ADR approval, `DELIVERY-PLAN.md` checklist items, scope,
   test deletion) and ask them in **one** `AskUserQuestion` round, each with a recommended option; record answers on
   the issues. Mid-wave, ask in plain text instead: `AskUserQuestion` blocks the conductor while independent issues
   could keep moving.
3. **Value gate.** Before an issue enters a slice, and before any finding is folded or filed, weigh the user's gain
   against the maintenance it adds. Proceed anyway for a correctness or evidence-trust defect (wrong state shown,
   interpolation labelled `observed`, a boundary leak). Say which applies in the brief's first line.
4. **Order** follows `docs/DELIVERY-PLAN.md`: schema/core before viewer, viewer before editor, reducer before replay
   UI. Breaking format changes need their ADR merged (or in the same PR) first.

## Loop per issue

1. **Brief** (`$WAVE_BRIEFS/<n>-task.md`): re-verify every fact on current `origin/main` (paths, types, doc sections)
   — issue text goes stale. Sections: *Facts (verified on main)* / *Do* / *Invariants that apply* / *Acceptance
   (tests)* / sentinel line. Name what to reuse, what is out of scope, and conductor decisions as "final — do not
   re-litigate". End with `Sentinel (last line of .review/W-<n>-REPORT.md): <!-- W-<n>-DONE -->`. Check `ls docs/adr`
   before assigning an ADR number.
   **Self-check:** walk `templates/brief-check.md` yourself. For `impl-complex` and `impl-mid` briefs also launch a
   brief check: task `$WAVE_BRIEFS/<n>-BRIEFCHECK-TASK.md` (names the brief, the template, the report path and
   `<!-- W-<n>-BRIEFCHECK-DONE -->`), `worker-launch.sh --role review-check --cwd "$EV_MAIN"` while the main checkout
   is clean at `origin/main`. Fold its findings into the brief, then launch.
2. **Launch:** `scripts/launch-worker.sh <n> <slug>`. Parallelise only issues that touch disjoint files; 3–5 in flight
   is the sustainable ceiling. Workers have no network: when a brief adds a dependency set
   `PRE_ADD='<pnpm filter> <pkg@exact> [...]'` and say so in the brief.
   - `WORKER_ROLE=impl-complex` (and for its fix rounds `--role impl-complex`) when any holds: it changes a format
     or schema together with its consumers, or touches three or more packages; it touches the package boundary or
     `platform-adapter`; it carries ordering or state logic (the replay reducer, seek/tie/late handling, editor
     undo/redo or publish revisions); an earlier round on the issue failed.
   - `WORKER_ROLE=impl-mid` for single-module behaviour fixes, accessibility or layout corrections, and doc-versus-
     code reconciliations where the brief cannot spell out every line.
   - `impl` for mechanical briefs; an `impl` quota stop relaunches in the same worktree with shared
     `worker-launch.sh --role impl-luna` and a task that says the worktree holds partial edits.
   Record the role and the reason in `W-<n>-VERIFY.md`.
3. **Wait:** shared `worker-wait.sh --state "$WAVE_STATE/W-<n>.json" --timeout 3600 --poll 30`, always via the Bash
   tool's `run_in_background` — never a foreground poll or `sleep` loop. For several workers pass repeated `--state`
   and `--any`. Exit codes: `0` done → verify; `10` failed → read `log_tail`, then write a repair brief; `11` quota →
   stop and relaunch as above; `12` timeout → inspect progress, do not treat it as done or launch a duplicate; `2`
   usage → fix the arguments. `scripts/wave-status.py` shows the whole wave.
4. **Verify on the host:** `scripts/verify.sh <worktree>` (needs `WAVE_STATE`). It runs the root `lint`,
   `typecheck`, `test` and `build` scripts when defined, the package-boundary check, `asset-check.py` and
   `worker-hygiene.sh`, and prints a summary. Then:
   - **Replay changes:** confirm tests exist for each AGENTS.md replay case the brief listed, and run the reducer
     suite twice — a different result is a determinism failure.
   - **Asset/schema changes:** `asset-check.py` covers structure and SVG safety; port endpoints, levels and
     hierarchy cycles are checked by `packages/core`'s validator through `test` once it exists. Until then, check
     them by reading the JSON and record that in VERIFY.
   - Mutation-check new tests once (break the fix, see the named test fail, restore).
   - Commit with the issue number, then run `python3 scripts/review-plan.py <worktree>`.
5. **Fix it yourself only if mechanical** (import order, a fixture typo, a test expectation that pinned removed
   behaviour). Record each in `.review/W-<n>-VERIFY.md`. Anything with judgment → a fix brief
   (`.review/W-<n>-FIX<k>-TASK.md`) with the host output quoted, launched with shared `worker-launch.sh --role fix
   --cwd <worktree> --task <abs> --report <abs> --sentinel '<sentinel>' --name W-<n>-FIX<k> --state-dir "$WAVE_STATE"`.
6. **Browser evidence for UI** (once `apps/studio` exists): start the Studio dev server from the worktree's root
   `dev` script on a free port, bound to `<label>.localhost`, and a second one from a baseline worktree detached at
   `origin/main` (`git worktree add --detach <wave>/baseline origin/main`; never `$EV_MAIN`). Capture screenshots
   with the `ego-browser` skill into `.review/<n>-shots/`. Stop both servers in the same turn they are no longer
   needed.
7. **Role-split review, chosen by trigger.** Run host verification and captures **first**.
   - **Plan:** record the `review-plan.py` output in VERIFY. `code` → `review-final`. `ux: required` → `review-ux`.
     `ux: optional` → the conductor decides and records a one-line reason. Flags go into every reviewer task:
     `boundary` (check the package boundary first), `replay`, `schema` (and `schema_without_adr`), `instructions`
     (read the branch's `.claude/**`, `skills/**`, `AGENTS.md`, `CLAUDE.md` diff yourself before launching anyone).

     | Role | Task / report / sentinel | Rules |
     |---|---|---|
     | `review-final` | `W-<n>-FINAL-TASK.md` / `-FINAL-REPORT.md` / `<!-- W-<n>-FINAL-DONE -->` | `templates/review-rules.md` → `.review/00-REVIEW-RULES.md` |
     | `review-ux` | `W-<n>-UX-TASK.md` / `-UX-REPORT.md` / `<!-- W-<n>-UX-DONE -->` | `.claude/agents/review-ux.md` (`--agent`) |
     | `review-quality` | `SLICE-<m>-QUALITY-TASK.md` / `-QUALITY-REPORT.md` / `<!-- SLICE-<m>-QUALITY-DONE -->` | `.claude/agents/review-quality.md` |

   - **Launch the code reviewer at once**; it needs no preview. Launch `review-ux` with the branch and baseline
     preview URLs, at most three scenarios from the brief, and an absolute screenshot directory you create first.
     At most one claude reviewer runs at a time (shared quota). Every role: shared `worker-launch.sh --role <role>
     --cwd <worktree> --task <abs> --report <abs> --sentinel '<sentinel>' --name <name> --state-dir "$WAVE_STATE"`.
   - **Wait** with `worker-wait.sh --any --kill-on-timeout` (`--timeout 5400` for UX, 3600 otherwise). `10`/`12`: use a
     partial report if one exists, else relaunch once, then record the gap. `11`: wait for the reset or skip the role
     and record why in VERIFY and the PR body.
   - **Tripwire:** record `git rev-parse HEAD`, `git status --porcelain` and `git stash list | wc -l` in the worktree
     and in `$EV_MAIN` before reviewer launch, and compare after.
   - **Merge findings.** Drop duplicates; resolve conflicts in this order: AGENTS.md invariants (boundary, evidence
     fidelity, geometry ≠ connectivity, unknown stays unknown) → ADRs and recorded owner decisions → correctness and
     contracts → the brief → UX → style. A finding that contradicts the brief or is really a product question goes to
     the owner (an **Owner questions** section in the PR body and a `needs-triage` issue); hold the merge if it is a
     `blocker`. Owner decisions marked final are never reversed in a fix round.
   - **Pre-existing findings — fold, file or note** (value gate first). **Fold** into FIX1 only when all hold: no
     owner decision and no format/schema change; a defect fix, not a refactor; files already in the diff or the same
     package; ≤30 non-test lines per item and ≤3 items; a behaviour change carries a regression test. **File** one
     grouped issue otherwise. **Note** `minor`/`nit` outside the touched area as one line each under **Noted, not
     filed** in the PR body.
   - Put every kept finding, tagged with its role, into **one** fix brief (`W-<n>-FIX1-TASK.md`). The conductor
     verifies the fix round and ships; there is no second full review. For `impl-complex` issues, FIX1 gets one
     `review-check` on the fix diff; its findings go into at most one FIX2 that the conductor reviews directly.
   - No review at all for docs-only changes; the plan reports no roles for them.
8. **Ship:** rerun `verify.sh` after rebasing on `origin/main`. Shared `ship-pr.sh --branch feature/<n>-<slug> --base
   main --title '<title>' --body-file <file> --ci --ci-timeout 3600` (body: change, review verdicts with applied and
   deferred findings, verification table, unrun checks stated honestly). Without a merge grant, omit `--merge` and
   leave the PR open. With one: `SHIP_AUTOMERGE=1` and `--merge --issue <n> --close-comment '<outcome>'`. Pass only
   finished resources via `--worktree`/`--terminal`; never chain `orca worktree rm` after it. Exit `20` rebase
   conflict, `21` CI failed, `22` CI timeout, `30`/`31` merge refused. Confirm the pinned head before claiming shipped.
   Close every finished terminal and remove every finished worktree.
9. Keep `HANDOFF.md` (repo root, local-only) current every few PRs, updated in place. File only owner decisions and
   "file" items as issues; a flake is filed on its second occurrence.
10. **Slice close.** When the slice's last issue has shipped:
    - **`review-quality`** in a disposable Orca worktree (`orca worktree create --base-branch origin/main`). The task's
      first line is "Read `.claude/agents/review-quality.md` and follow it as your role definition."; it names the
      commit range (slice start..`origin/main`), the issues, the report and the sentinel. Act on its classes:
      `release-blocker` → a normal issue loop; `fix-in-slice` → one chore PR; `follow-up` → fold, file or note.
    - When the slice changed the Studio, one `review-ux` walkthrough over at most three of the slice's user flows.
    - One slice per session: write the handoff and recommend a fresh session.

## Tools

- `scripts/verify.sh <worktree>` — host gates (step 4); logs in `$WAVE_STATE/verify-<basename>/`.
- `scripts/asset-check.py <checkout> [paths...]` — JSON duplicate keys and validity; SVG well-formedness, `viewBox`,
  unique ids, no `<script>`/`<foreignObject>`/`on*=`/`javascript:`/external `href`. Tests: `test-asset-check.py`.
- `scripts/review-plan.py <checkout> [--base origin/main] [--head HEAD]` — step 7 plan; refuses uncommitted changes.
  Tests: `test-review-plan.py`.
- `scripts/worker-hygiene.sh <worktree>` — new suppressions fail; whitespace churn is reported.
  Tests: `test-worker-hygiene.py`.
- `scripts/wave-status.py [--json] [--prs] [--state-dir <dir>]` — read-only snapshot of workers, previews,
  worktrees, containers and open PRs. Tests: `test-wave-status.py`.

## Traps (carried over from FeedbackOps, still applicable)

- `orca terminal create` accepts only Orca-managed worktrees; a plain `git worktree add` baseline cannot host a
  `codex-orca` reviewer. Run previews there, or launch codex in the background (`--role impl-fallback`).
- Workers that add helpers to a barrel file break partial `vi.mock` of that barrel; import new helpers from the
  defining module.
- zsh: never name a variable `path` (tied to `PATH`) or `status` (read-only).
- A merge that adds dependencies breaks other worktrees' builds until `pnpm install --frozen-lockfile` runs there.
- The worktree's own `.review/` is gitignored — copy briefs and rules in; `orca worktree create` may fail to return
  a terminal handle (retry `terminal create`).
- If Orca hangs at `runtimeState: starting`, launch with `WORKER_ROLE=impl-fallback` (background `codex exec`).
