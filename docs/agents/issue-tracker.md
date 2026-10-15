# Issue tracker: GitHub

Issues for this repo live as GitHub issues on `hjung3113/equipment-visualization`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc or `--body-file` for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels --jq '[.[] | {number, title, labels: [.labels[].name]}]'` with `--label` / `--state` filters.
- **Comment**: `gh issue comment <number> --body "..."`
- **Labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

PRs target `develop`, so merging a PR never auto-closes its issue. Close issues explicitly with `gh issue close`.

## Structure

- **Epics** #1 (M0 assets), #2 (M1 Onboarding Studio), #3 (M2 replay) hold slice checklists.
- **Slice issues** #5–#15 (S0–S10) are one issue = one branch = one PR. Each body starts with `**선행:** #a, #b · **에픽:** #n`; an issue is ready when every listed predecessor is closed.
- External PRs are not a request surface.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
