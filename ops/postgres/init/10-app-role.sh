#!/bin/sh
# First-start hook for the official Postgres image (docker-entrypoint-initdb.d):
# creates the least-privilege application login. Table grants are applied by
# the migrate service (scripts/db-grants.ts) after every migration.
set -eu
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD must be set}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$APP_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE margix_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'margix_app')
\gexec
SQL
