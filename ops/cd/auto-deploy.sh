#!/usr/bin/env bash
# Continuous deployment for the home server, pull-based: run by
# margix-autodeploy.timer every few minutes from the production checkout
# (~/apps/margix-production, never a development tree).
#
#   ops/cd/auto-deploy.sh            # deploy origin/main if it is new and CI is green
#   ops/cd/auto-deploy.sh --dry-run  # say what would happen, change nothing
#
# A commit is deployed only when
#   1. it is new (not the running release, not already attempted and failed),
#   2. every required CI job on it has passed (GitHub check runs), and
#   3. it contains the running release (git ancestry) — so the timer never
#      rolls production back, e.g. after a hotfix deployed by hand.
# Nothing needs to reach this machine from outside and no secret is stored in
# GitHub: the server only reads the public repository and its check results.
set -euo pipefail

REPO_SLUG="${MARGIX_REPO:-vishalkumar-swe/Margix-IMS}"
BRANCH="${MARGIX_DEPLOY_BRANCH:-main}"
# CI jobs that must succeed (names from .github/workflows/ci.yml).
REQUIRED_CHECKS=("Lint, typecheck, test, build" "End-to-end (Playwright)" "Container images build" "Dependency audit")
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/margix-cd"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
log() { printf '[auto-deploy %s] %s\n' "$(date +%H:%M:%S)" "$*"; }
mkdir -p "$STATE_DIR"
cd "$ROOT"

git fetch --quiet origin "$BRANCH"
candidate="$(git rev-parse "origin/$BRANCH")"
short="${candidate:0:7}"

running="$(podman exec margix-app-1 cat /app/REVISION 2>/dev/null || true)"
running_sha="${running%-dirty}"
if [[ "$running_sha" == "$candidate" ]]; then
  exit 0 # Up to date: stay quiet.
fi
if [[ "$(cat "$STATE_DIR/failed" 2>/dev/null)" == "$candidate" ]]; then
  exit 0 # Already tried and failed; waits for the next commit.
fi

# 3. Never roll back: the running release must be part of the candidate's history.
if [[ -n "$running_sha" ]]; then
  git cat-file -e "$running_sha^{commit}" 2>/dev/null || git fetch --quiet origin "+refs/heads/*:refs/remotes/origin/*" || true
  if ! git merge-base --is-ancestor "$running_sha" "$candidate" 2>/dev/null; then
    if [[ "$(cat "$STATE_DIR/skipped" 2>/dev/null)" != "$candidate" ]]; then
      log "Not deploying $BRANCH@$short: it does not contain the running release ${running_sha:0:7}. Merge that into $BRANCH first."
      echo "$candidate" > "$STATE_DIR/skipped"
    fi
    exit 0
  fi
fi

# 2. CI must be green for this exact commit.
checks="$(curl -fsS -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO_SLUG/commits/$candidate/check-runs?per_page=100")" \
  || { log "Could not read CI results from GitHub; will retry."; exit 0; }
verdict="$(REQUIRED="$(printf '%s\n' "${REQUIRED_CHECKS[@]}")" python3 -c '
import json, os, sys
runs = {r["name"]: r for r in json.load(sys.stdin)["check_runs"]}
states = []
for name in os.environ["REQUIRED"].splitlines():
    run = runs.get(name)
    if run is None or run["status"] != "completed":
        states.append("pending")
    elif run["conclusion"] != "success":
        states.append("failed:" + name)
print(next((s for s in states if s.startswith("failed")), "pending" if states else "green"))
' <<<"$checks")"

case "$verdict" in
  pending) exit 0 ;; # CI still running (or not started): check again next time.
  failed:*)
    log "Not deploying $BRANCH@$short: CI job \"${verdict#failed:}\" did not pass."
    echo "$candidate" > "$STATE_DIR/failed"
    exit 0
    ;;
esac

log "Deploying $BRANCH@$short (running: ${running_sha:0:7}${running_sha:+ }$([[ -z "$running_sha" ]] && echo none))"
if $DRY_RUN; then
  log "Dry run: stopping here."
  exit 0
fi

git checkout --quiet --force --detach "$candidate"
# Dependencies only when the lockfile changed since the last install.
lock_hash="$(sha256sum package-lock.json | cut -d' ' -f1)"
if [[ ! -d node_modules || "$(cat "$STATE_DIR/lock-hash" 2>/dev/null)" != "$lock_hash" ]]; then
  log "Installing dependencies"
  nice -n 10 npm ci --no-audit --no-fund --loglevel=error
  echo "$lock_hash" > "$STATE_DIR/lock-hash"
fi

if nice -n 10 deploy/deploy.sh; then
  rm -f "$STATE_DIR/failed" "$STATE_DIR/skipped"
  echo "$candidate $(date -Is)" >> "$STATE_DIR/history"
  log "Deployed $BRANCH@$short"
else
  status=$?
  [[ $status -eq 75 ]] && { log "A deploy was already running; will retry."; exit 0; }
  echo "$candidate" > "$STATE_DIR/failed"
  log "Deploy of $BRANCH@$short FAILED (exit $status); production keeps the previous release. See deploy/.last-build.log and journalctl --user -u margix-autodeploy."
  exit 1
fi
