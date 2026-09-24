#!/bin/sh
# Pre-deploy step (Railway runs it from the app image before each new version
# starts serving): apply pending migrations, make sure the least-privilege
# application login exists, and (re)apply its grants. Idempotent.
#
# Needs: DIRECT_DATABASE_URL (schema owner), DATABASE_URL (app login; Prisma
# validates that it is set), APP_DB_PASSWORD (the app login's password).
set -eu
: "${DIRECT_DATABASE_URL:?DIRECT_DATABASE_URL (schema owner) is required}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"

export PRISMA_HIDE_UPDATE_MESSAGE=1
prisma() { node /opt/prisma-cli/node_modules/prisma/build/index.js "$@"; }

prisma migrate deploy --schema prisma/schema.prisma

# The password is embedded in SQL, so only letters and digits are accepted.
case "$APP_DB_PASSWORD" in
  *[!A-Za-z0-9]* | "") echo "APP_DB_PASSWORD must be letters and digits only." >&2; exit 1 ;;
esac
printf '%s\n' "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'margix_app') THEN
    CREATE ROLE margix_app LOGIN PASSWORD '$APP_DB_PASSWORD';
  ELSE
    ALTER ROLE margix_app WITH LOGIN PASSWORD '$APP_DB_PASSWORD';
  END IF;
END \$\$;" | prisma db execute --stdin --url "$DIRECT_DATABASE_URL"

prisma db execute --file ops/postgres/app-role-grants.sql --url "$DIRECT_DATABASE_URL"
echo "Pre-deploy complete: migrations applied, app login and grants in place."
