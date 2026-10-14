#!/bin/bash
# worker-hygiene.sh <worktree> — two worker violations that recurred in the FeedbackOps waves this skill came from.
#   1. A new lint/type suppression fails the check (`biome-ignore`, `eslint-disable`, `@ts-ignore`, `@ts-nocheck`):
#      briefs forbid them; a real exception is the conductor's call, recorded in VERIFY.
#   2. Whitespace-only churn is reported, not failed: files with more than HYGIENE_WS_LINES (default 6) changed
#      lines that differ only in whitespace. Re-indenting code under a new wrapper is legitimate, so the conductor
#      reads the diff of each listed file before committing.
# Only product sources (apps/, packages/) count. Compares the working tree (commits + uncommitted + untracked) with
# the merge-base of HYGIENE_BASE (default origin/main).
wt=${1:?usage: worker-hygiene.sh <worktree>}; cd "$wt" || exit 2
base=${HYGIENE_BASE:-origin/main}; limit=${HYGIENE_WS_LINES:-6}
mb=$(git merge-base "$base" HEAD) || exit 2
pattern='biome-ignore|eslint-disable|@ts-ignore|@ts-nocheck'
found=0

ignores=$(git diff -U0 "$mb" -- apps packages ':(exclude)*.png' | awk -v pat="$pattern" '
  /^\+\+\+ b\// { file = substr($0, 7); next }
  /^\+/ && $0 ~ pat { print file ": " substr($0, 2) }')
untracked_ignores=$(git ls-files --others --exclude-standard -z -- apps packages | xargs -0 grep -HnE "$pattern" 2>/dev/null)
if [ -n "$ignores$untracked_ignores" ]; then
  found=1
  echo "NEW lint/type suppression (forbidden by the implementation rules):"
  printf '%s\n' "$ignores" "$untracked_ignores" | sed '/^$/d; s/^/  /'
fi

churn=$(awk -F'\t' -v limit="$limit" '
  FILENAME == ARGV[1] { if ($1 != "-") ws[$3] = $1 + $2; next }
  $1 != "-" { d = $1 + $2 - ws[$3]; if (d > limit) print "  " $3 ": " d " changed lines differ only in whitespace" }' \
  <(git diff -w --numstat "$mb" -- .) <(git diff --numstat "$mb" -- .))
if [ -n "$churn" ]; then
  echo "Review (not a failure): whitespace-only lines; confirm each is re-indentation the change needed:"
  echo "$churn"
fi

[ "$found" -eq 0 ] && echo "worker-hygiene: no new suppression"
exit "$found"
