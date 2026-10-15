#!/bin/zsh
# launch-worker.sh <issue> <slug> — Orca worktree from origin/develop → branch feature/<issue>-<slug>, copy the brief
# ($WAVE_BRIEFS/<issue>-task.md) and the rules templates into .review/, install dependencies when a lockfile exists,
# close setup shells, then delegate launch and worker state to the shared worker-launch.sh.
# WORKER_ROLE defaults to impl; impl-mid, impl-complex and impl-fallback select the routing table rows of those names.
# Optional WORKER_MODEL / WORKER_EFFORT override the shared routing.tsv for this session.
# Optional PRE_ADD='<pnpm filter> <pkg@exact> [...]' installs dependencies before the worker starts (workers have no
# network). pnpm may reformat package.json arrays: check the diff before committing.
# Needs: WAVE_STATE, WAVE_BRIEFS, EV_MAIN (main checkout path).
: "${WAVE_STATE:?}"; : "${WAVE_BRIEFS:?}"; : "${EV_MAIN:?}"; set -u
N=$1; SLUG=$2; CONDUCTOR=$EV_MAIN/.claude/conductor
# The script cds into the new worktree, so a relative brief dir would silently resolve there (an empty task).
WAVE_BRIEFS=${WAVE_BRIEFS:A}; WAVE_STATE=${WAVE_STATE:A}
[ -f "$WAVE_BRIEFS/$N-task.md" ] || { echo "Missing brief: $WAVE_BRIEFS/$N-task.md" >&2; exit 2; }
SHARED_LAUNCH=$HOME/.claude/skills/orca-dispatch-recipes/scripts/worker-launch.sh
[ -f "$SHARED_LAUNCH" ] || { echo "Missing shared launcher: $SHARED_LAUNCH (install orca-dispatch-recipes worker-ops scripts)" >&2; exit 2; }
orca worktree create --repo path:"$EV_MAIN" --name "$N-$SLUG" --base-branch origin/develop --issue "$N" --setup skip --json >/dev/null 2>&1 \
  || { echo "worktree create failed"; exit 1; }
# Orca chooses the worktree location; find it by name instead of assuming a workspace path.
W=$(git -C "$EV_MAIN" worktree list --porcelain | awk -v n="/$N-$SLUG" '/^worktree / { p = substr($0, 10); if (substr(p, length(p) - length(n) + 1) == n) print p }' | tail -1)
[ -n "$W" ] && cd "$W" || { echo "created worktree $N-$SLUG not found in git worktree list"; exit 1; }
git branch -m "feature/$N-$SLUG"; mkdir -p .review
cp "$CONDUCTOR/templates/impl-rules.md" .review/00-IMPL-RULES.md
cp "$CONDUCTOR/templates/review-rules.md" .review/00-REVIEW-RULES.md
# The shared launcher reads only the task; include the copied rules without moving its final sentinel.
{ printf 'Read .review/00-IMPL-RULES.md first.\n\n'; cat "$WAVE_BRIEFS/$N-task.md"; } > ".review/W-$N-TASK.md"
for h in $(orca terminal list --worktree path:"$W" --json 2>/dev/null | grep -o 'term_[a-z0-9-]*' | sort -u); do orca terminal close --terminal "$h" >/dev/null 2>&1; done
if [ -f pnpm-lock.yaml ]; then
  pnpm install --frozen-lockfile < /dev/null > .review/install.log 2>&1 || { echo "pnpm install failed (see $W/.review/install.log)"; exit 1; }
fi
if [ -n "${PRE_ADD:-}" ]; then
  pa=(${=PRE_ADD})
  pnpm --filter "${pa[1]}" add --save-exact --config.confirmModulesPurge=false "${(@)pa[2,-1]}" < /dev/null > .review/pre-add.log 2>&1 \
    || { echo "PRE_ADD failed (see $W/.review/pre-add.log)"; exit 1; }
fi
args=(--role "${WORKER_ROLE:-impl}" --cwd "$W" --task "$W/.review/W-$N-TASK.md"
  --report "$W/.review/W-$N-REPORT.md" --sentinel "<!-- W-$N-DONE -->" --name "W-$N"
  --state-dir "$WAVE_STATE")
[ -n "${WORKER_MODEL:-}" ] && args+=(--model "$WORKER_MODEL")
[ -n "${WORKER_EFFORT:-}" ] && args+=(--effort "$WORKER_EFFORT")
bash "$SHARED_LAUNCH" "${args[@]}"
