# Shared helpers for the backup scripts (sourced, not executed).
#
# Connection: the standard libpq variables PGHOST, PGPORT, PGUSER, PGPASSWORD,
# PGDATABASE (defaults: user and database "margix"). Use the schema owner,
# never the least-privilege app login.
#
# When PG_CONTAINER is set, the Postgres client tools run inside that
# container (e.g. PG_CONTAINER=margix-postgres) through CONTAINER_RUNTIME
# (default podman), so the host needs no Postgres client installed.

set -euo pipefail

export PGUSER="${PGUSER:-margix}"
export PGDATABASE="${PGDATABASE:-margix}"
CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-podman}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# pg_tool <tool> [args...] — runs a Postgres client tool with stdin/stdout attached.
pg_tool() {
  if [[ -n "${PG_CONTAINER:-}" ]]; then
    local env_args=()
    for var in PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE; do
      [[ -n "${!var:-}" ]] && env_args+=(-e "$var=${!var}")
    done
    "$CONTAINER_RUNTIME" exec -i "${env_args[@]}" "$PG_CONTAINER" "$@"
  else
    command -v "$1" >/dev/null || die "$1 not found; install the Postgres client or set PG_CONTAINER."
    "$@"
  fi
}

# psql_value <database> <sql> — prints a single value.
psql_value() {
  pg_tool psql -X -q -v ON_ERROR_STOP=1 -At -d "$1" -c "$2"
}
