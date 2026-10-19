# Development rules — equipment-visualization

## Purpose
Build a reusable semantic equipment Top View and explainable log replay framework. The repository must remain **standalone**; analytics-platform is an optional consumer, not a dependency.

## Operating rules
- State assumptions when the request can be read in more than one way.
- Prefer the smallest change that satisfies the request. Do not add speculative flexibility.
- Every changed line must trace to a user request, a documented invariant, or a failing verification.
- If domain rules conflict with generic framework habits, follow the domain rules.

## Finish line and stops
- **Finish line for an issue:** the touched behaviour has passing tests, the gate below is green, docs affected by the change are updated in the same PR, and a PR to `develop` is open. Merge and close the issue only when auto-merge was granted in this session; otherwise the user merges.
- **Keep going** through steps that don't need the user. **Stop and report** on a documentation conflict that no ADR or glossary entry resolves, and before any merge, push or release the user has not authorised in this session.

## Git workflow
- **Per-issue branch** from `develop`: `feature/<issue-number>-<slug>`, `fix/<n>-<slug>`, or `chore/<slug>` for housekeeping. Never commit directly to `develop` or `main`.
- **Issue complete → PR to `develop`.** PRs into `develop` do not auto-close issues; close them with `gh issue close`. Delete the branch on merge.
- **Slice complete → release PR `develop` → `main`.** The user owns that merge and any tag. No agent push to `main`. `review-quality` runs once per slice before the release PR.
- **Hooks.** Enable once per clone: `git config core.hooksPath .githooks`. `pre-commit` refuses commits on `develop`/`main` (README-only on `main` allowed); `pre-push` blocks direct non-README pushes to `main`. Client-side only. The server-side gate is GitHub branch protection on `develop` and `main` (required check `Gate`, admins included, no force push or deletion) plus a ruleset that limits `main` to merge-commit PRs, so even a README-only change reaches `main` through a PR.

## Before implementation
- Read `README.md`, `GLOSSARY.md` (glossary), `docs/DESIGN-v0.4.md`, `docs/REPLAY-CONTRACT.md`, `docs/ONBOARDING.md`, `docs/VIEWS.md`, `docs/INTEGRATION.md`, `docs/adr/`.
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
- UI changes: browser interaction, keyboard/a11y, variants review, and the analytics-platform design system (ADR-0008): `@fops/ui` controls and tokens, the platform shell structure, compared side by side with a platform screen of the same kind; default browser controls fail it.
  - Design lint (`@shadcn/lint` in `eslint.config.js`, options mirrored from FeedbackOps `.oxlintrc.json`) covers `packages/ui`, `packages/replay`, `packages/editor` and `apps/studio` `.tsx`. `eslint-suppressions.json` holds only findings that predate it; it may shrink, never grow (no new suppressions, no `eslint --suppress-*` runs). The config exceptions are `shadcn/no-restyle: off` for `packages/ui/src/Tabs.tsx` (#73 slice f1: AP-underline tabs wrap the `@fops/ui` tab parts, as AP does) and `shadcn/no-inline-styles: off` for `packages/ui/src/DataTable.tsx` (#113: virtualizer runtime geometry only, as AP's `PlatformDataTable` does); add no other.
  - A UI pattern `@fops/ui` does not provide (dense table, app shell, evidence badge, time slider, …) gets an EV component or layout first (components in `@eqv/ui`), built on `@fops/ui` primitives and tokens; screens then use it. No screen-local restyling in its place.
- Report unrun checks honestly; run reviewer pass for major design, auth, data trust or package boundary changes.
- For behaviour changes and bug fixes, write or update the failing test first, then make the smallest change that passes it. If TDD is not practical, say why and still verify the touched behaviour.
- Docs-only changes (Markdown under `docs/`, `AGENTS.md`/`CLAUDE.md`, `GLOSSARY.md`, `.claude/**/*.md`) need no gate run; confirm that every path, script and symbol they name exists. Scripts and settings under `.claude/` are code: run their tests or say why not.

### Test discipline
Test code is a liability. Fewer, sharper tests beat more tests.
- Test behaviour, not implementation. No asserts on private methods, internal state, or mock call counts/order.
- Grep for existing coverage before adding a test; one test = one concept; parameterise variants with `it.each`.
- Do not test trivial passthrough, getters/setters or framework behaviour, and do not chase coverage.
- Pruning: list deletion candidates with a one-line reason each, wait for user approval, run the suite before and after, delete in small batches.

## Workflow operations
- Playbook for running issues with workers (briefs, launch, host verification, role-split review, ship, cleanup): the global `issue-wave-conductor` skill, with this repo's parts in `.claude/conductor/PROFILE.md`. Model routing comes from the user-level `orca-dispatch-recipes` skill (`routing.tsv`); the profile adds only the per-issue complexity criteria.
- Workers run in Orca-managed worktrees and terminals (`orca-cli`, `orchestration`, `orca-dispatch-recipes` skills). Close every worktree and terminal you created as soon as its work is done.
- Reviewers are chosen per issue by the global `$ENGINE/review-plan.py` (`~/.agents/skills/issue-wave-conductor/scripts`, settings in `.claude/conductor/conductor.json` + `addenda/`); reviewer personas are global (`~/.agents/agents/review-*.md`), and this repo's authority, checks and invariants for them are the `Review lens` sections of `.claude/conductor/PROFILE.md`.
- PR review priorities: domain-invariant violations (evidence fidelity, geometry vs connectivity, unknowns), package-boundary leaks, missing verification, and docs that disagree with `GLOSSARY.md` or an ADR.

## Agent docs
- **Issue tracker:** GitHub issues on `hjung3113/equipment-visualization` via `gh`. See `docs/agents/issue-tracker.md`.
- **Triage labels:** `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.
- **Domain docs:** root `GLOSSARY.md` owns the glossary; `docs/adr/` owns architectural decisions. See `docs/agents/domain.md`.
- Agent-facing docs (`AGENTS.md`, `CLAUDE.md`, memory files) are written in English.

## Integration rules
- Platform handles auth/Scope/time/route/context/permissions/audit; visualization accepts data through explicit props/adapters.
- Platform menus consume through declared `menuQuery` endpoints; no domain-specific methods on `PlatformAdapter`.
- Do not modify analytics-platform from this repository; coordinate separate PRs/issues.
- Parent git submodule pins a commit; new revision requires explicit parent change and lockfile/CI validation.
