#!/usr/bin/env bash
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"  # zsh-invoked runs lose BASH_SOURCE
# release-gate.sh <develop-checkout> — verify the develop tip for a develop → main release, without creating a PR.
set -uo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
MODE=release-gate
CHECK_NAMES=()
CHECK_CODES=()
CHECK_COUNT=0
TESTED_SHA=
GATE_SCRIPTS=(lint typecheck test build)

usage() {
  cat <<'EOF'
Usage: release-gate.sh <develop-checkout>

Requires WAVE_STATE and a clean checkout at the current origin/develop tip.
Fetches develop and main, installs from the lockfile, then runs verify.sh (root lint, typecheck, test and build,
the package-boundary check, asset-check.py, worker hygiene against origin/main) and the test script a second time
(a different result is a determinism failure). On success it prints the complete gh command with the tested SHA; it
never creates or merges the release PR. Fails while the root package.json lacks the gate scripts (before #5).
EOF
}

finish() {
  local ok=$1 code=$2 i
  if [[ -n "$TESTED_SHA" ]]; then printf 'Tested develop tip: %s\n' "$TESTED_SHA"; fi
  printf '\n%-28s %s\n' 'Check' 'Exit'
  for ((i = 0; i < CHECK_COUNT; i++)); do
    printf '%-28s %s\n' "${CHECK_NAMES[$i]}" "${CHECK_CODES[$i]}"
  done
  printf '{"ok":%s,"command":"%s","checks":%d,"tested_sha":"%s"}\n' "$ok" "$MODE" "$CHECK_COUNT" "$TESTED_SHA"
  exit "$code"
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  finish false "${2:-2}"
}

run_check() {
  local name=$1 log=$2 code
  shift 2
  ("$@") >"$log" 2>&1
  code=$?
  CHECK_NAMES+=("$name")
  CHECK_CODES+=("$code")
  CHECK_COUNT=$((CHECK_COUNT + 1))
  if [[ "$code" != 0 ]]; then
    printf 'FAILED: %s (exit %s)\n' "$name" "$code" >&2
    tail -n 40 "$log" >&2
    finish false "$code"
  fi
  printf 'PASS: %s\n' "$name"
}

missing_gate_scripts() {
  python3 - "$1/package.json" "${GATE_SCRIPTS[@]}" <<'PY'
import json, sys
path, wanted = sys.argv[1], sys.argv[2:]
try:
    scripts = json.load(open(path)).get('scripts', {})
except (OSError, ValueError):
    scripts = {}
print(' '.join(s for s in wanted if s not in scripts))
PY
}

main() {
  if (( $# == 1 )) && [[ "$1" == --help || "$1" == -h ]]; then
    MODE=help
    usage
    finish true 0
  fi
  (( $# == 1 )) || fail 'usage: release-gate.sh <develop-checkout>' 2
  [[ -n "${WAVE_STATE:-}" ]] || fail 'set WAVE_STATE to the wave scratch directory' 2
  local checkout
  checkout=$(cd -- "$1" 2>/dev/null && pwd) || fail "checkout does not exist: $1" 2
  [[ -f "$checkout/AGENTS.md" && -f "$checkout/GLOSSARY.md" && -d "$checkout/docs/adr" ]] \
    || fail "not an equipment-visualization checkout: $checkout" 2
  [[ -x "$SCRIPT_DIR/verify.sh" ]] || fail 'verify.sh is missing or not executable' 2

  local missing
  missing=$(missing_gate_scripts "$checkout")
  [[ -z "$missing" ]] || fail "root package.json has no gate script(s): $missing — the workspace and its gate arrive with #5 (S0); nothing to release-gate yet" 2

  git -C "$checkout" fetch origin develop main || fail 'could not refresh origin/develop and origin/main' 1
  local head_sha develop_sha dirty
  head_sha=$(git -C "$checkout" rev-parse HEAD 2>/dev/null) || fail 'could not read checkout HEAD' 1
  develop_sha=$(git -C "$checkout" rev-parse origin/develop 2>/dev/null) || fail 'could not read origin/develop' 1
  [[ "$head_sha" == "$develop_sha" ]] || fail "checkout HEAD $head_sha is not the current origin/develop tip $develop_sha" 1
  dirty=$(git -C "$checkout" status --porcelain --untracked-files=no 2>/dev/null) || fail 'could not inspect checkout status' 1
  [[ -z "$dirty" ]] || fail 'release checkout has tracked worktree changes' 1
  TESTED_SHA=$head_sha

  mkdir -p "$WAVE_STATE/release-gate" || fail "cannot create release log directory under $WAVE_STATE" 2
  WAVE_STATE=$(cd -- "$WAVE_STATE" 2>/dev/null && pwd) || fail "cannot resolve WAVE_STATE: $WAVE_STATE" 2
  export WAVE_STATE
  local logdir=$WAVE_STATE/release-gate

  # The main checkout's node_modules goes stale across merges; install from the lockfile before the gate.
  run_check 'pnpm install --frozen-lockfile' "$logdir/install.log" \
    bash -c 'cd "$1" && pnpm install --frozen-lockfile < /dev/null' bash "$checkout"
  # Hygiene over the whole release diff, not just the last issue.
  run_check 'verify.sh (vs origin/main)' "$logdir/verify.log" env HYGIENE_BASE=origin/main "$SCRIPT_DIR/verify.sh" "$checkout"
  run_check 'test (second run)' "$logdir/test-rerun.log" bash -c 'cd "$1" && pnpm -s run test' bash "$checkout"

  printf "Next command: gh pr create --base main --head develop --title 'Release: develop -> main' --body 'Verified develop tip: %s'\n" "$TESTED_SHA"
  finish true 0
}

main "$@"
