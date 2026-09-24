#!/usr/bin/env bash
# Takes a compressed, restorable dump of the Margix database and prunes old ones.
#
#   ops/backup/backup.sh                       # host pg_dump, PG* env vars
#   PG_CONTAINER=margix-postgres ops/backup/backup.sh
#
# BACKUP_DIR        where dumps go (default ./backups)
# BACKUP_KEEP_DAYS  delete dumps older than this many days (default 14; 0 keeps all)
#
# Output: margix-<UTC timestamp>.dump (pg_dump custom format) plus a .sha256.
# Verify a dump with ops/backup/verify-restore.sh before relying on it.

source "$(dirname "$0")/lib.sh"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
[[ "$BACKUP_KEEP_DAYS" =~ ^[0-9]+$ ]] || die "BACKUP_KEEP_DAYS must be a whole number."

mkdir -p "$BACKUP_DIR"
umask 077
name="margix-$(date -u +%Y%m%dT%H%M%SZ).dump"
partial="$BACKUP_DIR/.$name.partial"
trap 'rm -f "$partial"' EXIT

log "Dumping database $PGDATABASE to $BACKUP_DIR/$name"
pg_tool pg_dump --format=custom --compress=6 --no-password "$PGDATABASE" > "$partial"
# A custom-format dump that pg_restore cannot list is corrupt or truncated.
pg_tool pg_restore --list < "$partial" > /dev/null || die "The dump is not readable."

mv "$partial" "$BACKUP_DIR/$name"
(cd "$BACKUP_DIR" && sha256sum "$name" > "$name.sha256")
log "Wrote $name ($(du -h "$BACKUP_DIR/$name" | cut -f1))"

if (( BACKUP_KEEP_DAYS > 0 )); then
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'margix-*.dump*' -mtime "+$BACKUP_KEEP_DAYS" -print -delete |
    while read -r old; do log "Pruned $old"; done
fi
