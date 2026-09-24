#!/usr/bin/env bash
# Fast deploy for the home-server stack: builds the app on the host with a warm
# build cache and swaps it into the running containers — about a minute,
# instead of rebuilding container images.
#
#   deploy/deploy.sh                  # build, migrate, restart
#   deploy/deploy.sh --rebuild-images # also rebuild the runtime/tools images
#                                     # (only after Node/base-image or dependency changes)
#
# Steps: 1) next build (standalone, into .next-release with its own cache)
#        2) assemble deploy/.release.new (server, static, public, migrations,
#           bundled Tally worker) — the running app is untouched until here
#        3) run migrations from the new release
#        4) swap the release in and restart app + worker; wait until ready.
# If the build or the migrations fail, nothing is swapped and the old version keeps serving.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/deploy"
COMPOSE=(podman compose -f "$DEPLOY/compose.prod.yml" --env-file "$DEPLOY/.env.production")
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
export PODMAN_COMPOSE_WARNING_LOGS=false

log() { printf '\033[1m[deploy %s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
started=$SECONDS
cd "$ROOT"

if [[ "${1:-}" == "--rebuild-images" ]]; then
  log "Rebuilding runtime and tools images"
  "${COMPOSE[@]}" build app seed
fi
if ! podman image exists localhost/margix-ims-runtime:latest; then
  log "Runtime image missing — building it once"
  "${COMPOSE[@]}" build app
fi

log "Building the app (warm cache)"
npx prisma generate >/dev/null
NEXT_OUTPUT=standalone NEXT_DIST_DIR=.next-release npx next build >"$DEPLOY/.last-build.log" 2>&1 \
  || { tail -30 "$DEPLOY/.last-build.log"; log "Build failed — nothing deployed"; exit 1; }

log "Assembling the release"
NEW="$DEPLOY/.release.new"
rm -rf "$NEW" && mkdir -p "$NEW"
cp -a .next-release/standalone/. "$NEW/"
mkdir -p "$NEW/.next-release/cache"
cp -a .next-release/static "$NEW/.next-release/static"
cp -a public "$NEW/public"
mkdir -p "$NEW/prisma" "$NEW/ops/postgres" "$NEW/ops/railway" "$NEW/scripts"
cp -a prisma/schema.prisma prisma/migrations "$NEW/prisma/"
cp -a ops/postgres/app-role-grants.sql "$NEW/ops/postgres/"
cp -a ops/railway/pre-deploy.sh "$NEW/ops/railway/"
# The background workers, bundled so they run with the release's own node_modules.
node scripts/build-workers.mjs "$NEW/scripts" >/dev/null
chmod -R a+rX "$NEW"

log "Running migrations"
"${COMPOSE[@]}" up -d postgres >/dev/null
podman run --rm --network margix_margix_net --env-file <(grep -E '^(POSTGRES_PASSWORD|APP_DB_PASSWORD)=' "$DEPLOY/.env.production") \
  -v "$NEW:/app:ro,z" localhost/margix-ims-runtime:latest sh -c '
    export DIRECT_DATABASE_URL="postgresql://margix:${POSTGRES_PASSWORD}@postgres:5432/margix?schema=public"
    export DATABASE_URL="postgresql://margix_app:${APP_DB_PASSWORD}@postgres:5432/margix?schema=public"
    sh ops/railway/pre-deploy.sh' \
  || { log "Migrations failed — nothing swapped"; exit 1; }

log "Swapping the release in"
rm -rf "$DEPLOY/release.old"
[[ -d "$DEPLOY/release" ]] && mv "$DEPLOY/release" "$DEPLOY/release.old"
mv "$NEW" "$DEPLOY/release"
"${COMPOSE[@]}" up -d --no-build 2>&1 | grep -iE "error|warn" || true
"${COMPOSE[@]}" restart app tally-sync notify 2>&1 | grep -iE "error" || true
rm -rf "$DEPLOY/release.old"

log "Waiting for the app"
for _ in $(seq 1 60); do
  if podman exec margix-ts-1 wget -qO- http://app:3000/api/ready >/dev/null 2>&1; then
    log "Live in $((SECONDS - started))s"
    exit 0
  fi
  sleep 1
done
log "The app did not become ready — check: podman logs --tail 50 margix-app-1"
exit 1
