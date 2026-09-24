#!/usr/bin/env bash
# Proves a backup is usable: restores it into a scratch database on the same
# server, checks the ledger invariants, prints row counts, then drops it.
#
#   ops/backup/verify-restore.sh backups/margix-20260924T020000Z.dump
#   PG_CONTAINER=margix-postgres ops/backup/verify-restore.sh <dump>
#
# Needs a login that may CREATE DATABASE (the schema owner in the dev setup).
# Exit code 0 = restorable and consistent.

source "$(dirname "$0")/lib.sh"

dump="${1:-}"
[[ -f "$dump" ]] || die "Usage: $0 <dump file>"
if [[ -f "$dump.sha256" ]]; then
  (cd "$(dirname "$dump")" && sha256sum --check --quiet "$(basename "$dump").sha256") || die "Checksum mismatch."
  log "Checksum OK"
fi

scratch="margix_restore_check_$(date -u +%Y%m%d%H%M%S)"
cleanup() { psql_value postgres "DROP DATABASE IF EXISTS \"$scratch\"" >/dev/null 2>&1 || true; }
trap cleanup EXIT

log "Restoring into scratch database $scratch"
psql_value postgres "CREATE DATABASE \"$scratch\"" >/dev/null
# --no-owner/--no-privileges: roles may differ from the source server.
pg_tool pg_restore --no-owner --no-privileges --exit-on-error -d "$scratch" < "$dump"

failures=0
check() {
  local label="$1" sql="$2" expected="$3" actual
  actual="$(psql_value "$scratch" "$sql")"
  if [[ "$actual" == "$expected" ]]; then
    log "PASS $label"
  else
    log "FAIL $label (expected $expected, got $actual)"
    failures=$((failures + 1))
  fi
}

check "migrations all applied" \
  "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL" "0"
check "stock_balance matches the ledger" "SELECT count(*) FROM v_stock_balance_drift" "0"
check "no negative balances" "SELECT count(*) FROM stock_balance WHERE quantity < 0" "0"
check "every reversal points at an existing entry" \
  "SELECT count(*) FROM inventory_ledger r LEFT JOIN inventory_ledger o ON o.id = r.reverses_entry_id
   WHERE r.reverses_entry_id IS NOT NULL AND o.id IS NULL" "0"
check "append-only triggers present" \
  "SELECT count(*) > 0 FROM pg_trigger WHERE tgrelid = 'inventory_ledger'::regclass AND NOT tgisinternal" "t"

log "Row counts:"
psql_value "$scratch" "
  SELECT format('  %-22s %s', t, n) FROM (
    SELECT 'users' t, count(*) n FROM app_user UNION ALL
    SELECT 'skus', count(*) FROM sku UNION ALL
    SELECT 'ledger entries', count(*) FROM inventory_ledger UNION ALL
    SELECT 'purchase orders', count(*) FROM purchase_order UNION ALL
    SELECT 'invoices', count(*) FROM invoice UNION ALL
    SELECT 'audit entries', count(*) FROM audit_log
  ) c" >&2
log "Latest ledger entry: $(psql_value "$scratch" "SELECT coalesce(max(created_at)::text, 'none') FROM inventory_ledger")"

(( failures == 0 )) || die "$failures check(s) failed; do not rely on this backup."
log "Backup verified."
