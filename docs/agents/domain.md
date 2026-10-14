# Domain Docs

How engineering skills should consume this repo's domain documentation.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — domain glossary. Terms listed under `_Avoid_` must not appear in code, tests, issue titles or docs.
- **`docs/adr/`** — architectural decisions (0001 package boundary, 0002 Occurrence input, 0003 facet Evidence Levels, 0004 three layout graphs, 0005 scoped alias rules). Read those touching the area you work in.
- The subject documents: `docs/DESIGN-v0.4.md` (domain model), `docs/REPLAY-CONTRACT.md`, `docs/ONBOARDING.md`, `docs/VIEWS.md`, `docs/INTEGRATION.md`.
- Per-directory `AGENTS.md` files once packages exist.

If a file doesn't exist yet, proceed silently.

## Precedence

`CONTEXT.md` holds vocabulary only, not implementation mechanics. When `CONTEXT.md` and an ADR disagree on a decision, the ADR wins. When a subject document disagrees with an ADR, the ADR wins and the document is stale — fix it in the same PR or report it.

## Use the glossary's vocabulary

When your output names a domain concept (issue title, refactor proposal, test name, identifier), use the term as defined in `CONTEXT.md`. If the concept isn't in the glossary, either you're inventing language the project doesn't use (reconsider) or there is a real gap (record it with the `domain-modeling` skill).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (replay never pairs Start/End) — but worth reopening because…_
