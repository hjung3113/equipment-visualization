#!/bin/bash
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"  # zsh-invoked runs lose BASH_SOURCE
# verify.sh <worktree> — host gates from AGENTS.md "Change quality gates", run by the conductor after a worker reports:
#   1. root package.json scripts `lint`, `typecheck`, `test`, `build`, each only when defined (`skip` otherwise; the
#      repo is docs-only until M1 adds the workspace);
#   2. package boundary (ADR-0013): no `@ap` or `analytics-platform` import specifier under apps/ or packages/ outside
#      packages/platform-adapter, except the design system `@ap/ui` in packages/{ui,replay,editor,views} and apps/studio;
#   3. asset-check.py over assets/ (JSON/SVG structure and safety);
#   4. global worker-hygiene.py (no new suppressions; whitespace churn reported).
# Logs go to $WAVE_STATE/verify-<basename>/; prints a summary table and exits with the first failing code.
here=$(cd "$(dirname "$0")" && pwd)
: "${WAVE_STATE:?set WAVE_STATE}"; wt=${1:?usage: verify.sh <worktree>}; log=$WAVE_STATE/verify-$(basename "$wt")
mkdir -p "$log"; cd "$wt" || exit 2
first_failure=0
check_names=(); check_codes=()
record() {
  check_names+=("$1"); check_codes+=("$2")
  if [ "$2" != skip ] && [ "$2" -ne 0 ] && [ "$first_failure" -eq 0 ]; then first_failure=$2; fi
}
run_check() {
  local check_name=$1 check_log=$2 check_code; shift 2
  ("$@") > "$check_log" 2>&1
  check_code=$?
  record "$check_name" "$check_code"
}
has_script() {
  [ -f package.json ] && python3 -c 'import json,sys; sys.exit(0 if sys.argv[1] in json.load(open("package.json")).get("scripts", {}) else 1)' "$1"
}
boundary() {
  [ -d apps ] || [ -d packages ] || { echo "no apps/ or packages/ yet"; return 0; }
  local hits
  # One hit per import specifier (static, side-effect, dynamic and require), so an allowed specifier never hides a
  # forbidden one on the same line. ADR-0013: '@ap/ui' is allowed only in packages/{ui,replay,editor,views} and apps/studio
  # (the ESLint allowlist); packages/platform-adapter is exempt; everything else is reported. ESLint stays the full check.
  hits=$(grep -rnoE "(from|import|import[[:space:]]*\(|require[[:space:]]*\()[[:space:]]*['\"](@ap|analytics-platform)(/[^'\"]*)?['\"]" apps packages \
    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.mjs' --include='*.vue' \
    --include='*.svelte' --exclude-dir=node_modules --exclude-dir=dist 2>/dev/null | grep -v '^packages/platform-adapter/' \
    | grep -vE "^(apps/studio|packages/(ui|replay|editor|views))/[^:]*:[0-9]+:.*['\"]@ap/ui(/[^'\"]*)?['\"]$")
  if [ -n "$hits" ]; then echo "platform import outside packages/platform-adapter:"; echo "$hits"; return 1; fi
  echo "boundary: no platform import outside the adapter"
}

for s in lint typecheck test build; do
  if has_script "$s"; then run_check "$s" "$log/$s.log" pnpm -s run "$s"; else record "$s" skip; fi
done
run_check boundary "$log/boundary.log" boundary
run_check asset-check "$log/asset-check.log" python3 "$here/asset-check.py" "$wt"
run_check worker-hygiene "$log/worker-hygiene.log" python3 "$HOME/.agents/skills/issue-wave-conductor/scripts/worker-hygiene.py" "$wt"

{
  printf '%-16s %s\n' 'Check' 'Exit'
  for ((i=0; i<${#check_names[@]}; i++)); do printf '%-16s %s\n' "${check_names[$i]}" "${check_codes[$i]}"; done
  grep -vE '^(worker-hygiene: no new|boundary: no platform)' "$log/boundary.log" "$log/worker-hygiene.log" 2>/dev/null \
    | sed 's#^[^:]*/##'
  tail -1 "$log/asset-check.log"
} > "$log/summary.txt"
cat "$log/summary.txt"
exit "$first_failure"
