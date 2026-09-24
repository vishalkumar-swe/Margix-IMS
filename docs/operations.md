# Margix IMS — Operations

## Database logins

| Login | Used by | Rights |
|-------|---------|--------|
| Schema owner (`DIRECT_DATABASE_URL`) | Migrations, `npm run db:grants` | Owns all tables |
| `margix_app` (`DATABASE_URL`) | The running application and the seed | Read/write rows only |

`margix_app` cannot TRUNCATE any table, cannot UPDATE or DELETE ledger entries
or audit records, and cannot read the migration history. The append-only
triggers already reject updates and deletes; the privileges add an
independent second layer and also cover TRUNCATE, which triggers do not.

### One-time setup (as a PostgreSQL superuser)

```sql
CREATE ROLE margix_app LOGIN PASSWORD '<strong password>';
```

Set `DATABASE_URL` to the `margix_app` login and `DIRECT_DATABASE_URL` to the
schema owner (see `.env.example`).

### After every migration

```bash
npm run db:deploy   # applies migrations, then the grants
```

`npm run db:reset` (development) resets, applies the grants and seeds.
`npm run db:grants` re-applies the grants on its own; it is idempotent.

## Scheduled Tally sync

The sync worker runs one pass per invocation (`npm run tally:sync`); failed
vouchers back off automatically and are retried on later passes. Run it on a
schedule, for example with the systemd user units in `ops/systemd/`:

```bash
mkdir -p ~/.config/systemd/user
cp ops/systemd/margix-tally-sync.{service,timer} ~/.config/systemd/user/
# Edit WorkingDirectory / PATH in the .service file for your checkout and Node install.
systemctl --user daemon-reload
systemctl --user enable --now margix-tally-sync.timer
loginctl enable-linger "$USER"   # keep user timers running without a login session
```

Check it with `systemctl --user list-timers` and
`journalctl --user -u margix-tally-sync.service`. Concurrent runs are safe:
jobs are claimed with `FOR UPDATE SKIP LOCKED`, so no voucher is pushed twice.

## Tally Prime connection

| `TALLY_MODE` | Behaviour |
|--------------|-----------|
| `mock` | Accepts every voucher (development, demos) |
| `fail` | Rejects every voucher as "not reachable" (testing the failure path) |
| `xml` | Posts to Tally Prime's HTTP/XML server at `TALLY_URL` (default `http://localhost:9000`) for company `TALLY_COMPANY` |
| `disabled` | No synchronisation; jobs stay pending |

Before switching to `xml`:

1. Enable Tally Prime's HTTP server (F1 → Settings → Connectivity → client/server
   configuration: "TallyPrime acts as Server", port 9000).
2. Map every SKU (`Tally stock item name`) and every Tally-synced godown
   (`Tally godown name`) to the exact names in Tally. Unmapped items fail with a
   plain message (e.g. "Item RM-001 is not mapped in Tally.") and the dashboard
   lists them under "Needs attention".
3. Vouchers are posted as Stock Journals, one per Margix document (reversals
   separately), with batch and godown allocations. Each carries
   `REMOTEID="margix-<document number>"` for traceability in Tally.

## Production deployment (containers)

The `Dockerfile` builds two images: `app` (the standalone Next.js server, runs
as a non-root user) and `tools` (migrations, grants, the seed and the Tally
sync worker). `deploy/compose.prod.yml` runs them with Postgres 16 and a
Tailscale sidecar that publishes the app over HTTPS via Funnel, with no host
port. Install, upgrade and day-to-day commands are in
[deploy/RUNBOOK.md](../deploy/RUNBOOK.md).

- On first start Postgres creates the `margix_app` login
  (`ops/postgres/init/10-app-role.sh`, password `APP_DB_PASSWORD`).
- Every `up` runs the one-shot `migrate` service (`prisma migrate deploy` +
  grants) before the app and the Tally worker start.
- In production the seed creates roles, units and the administrator; sample
  masters and stock only with `SEED_SAMPLE_DATA=true`; demo users never.
- TLS is terminated by Tailscale; session cookies are marked `Secure` when the
  request arrived over HTTPS (`X-Forwarded-Proto`).

## Backups and restore

`ops/backup/backup.sh` writes a compressed `pg_dump` (custom format) plus a
SHA-256 file and deletes dumps older than `BACKUP_KEEP_DAYS` (default 14).
`ops/backup/verify-restore.sh <dump>` checks the checksum, restores the dump
into a scratch database on the same server, verifies the ledger invariants
(no drift, no negative balance, reversal links, append-only triggers,
migrations complete), prints row counts and drops the scratch database.

Both use the standard `PG*` variables (schema owner). Without a local Postgres
client, set `PG_CONTAINER` to run the tools inside the database container:

```bash
PG_CONTAINER=margix-postgres BACKUP_DIR=~/backups/margix npm run db:backup
PG_CONTAINER=margix-postgres npm run db:verify-backup -- ~/backups/margix/margix-<timestamp>.dump
```

Nightly backups via systemd (per user):

```bash
cp ops/systemd/margix-backup.{service,timer} ~/.config/systemd/user/
# Edit WorkingDirectory / BACKUP_DIR / PG_CONTAINER in the .service file.
systemctl --user daemon-reload
systemctl --user enable --now margix-backup.timer
loginctl enable-linger "$USER"
```

Copy dumps off the machine (another host or object storage) — a backup on the
same disk does not survive a disk failure. Run `verify-restore.sh` on a recent
dump at least monthly.

**Restoring for real** (stop the app first so nothing writes meanwhile):

```bash
podman exec margix-postgres dropdb -U margix margix
podman exec margix-postgres createdb -U margix margix
podman exec -i margix-postgres pg_restore -U margix --no-owner -d margix < margix-<timestamp>.dump
npm run db:grants     # re-apply the app-login privileges
```

## Logs

The server writes JSON lines to stdout/stderr (`LOG_LEVEL`: debug, info, warn,
error). Each API request produces one `api request` line with `requestId`,
`method`, `path`, `status`, `durationMs` and `userId`; the same `requestId` is
returned in the `x-request-id` response header and in error responses, so a
user-reported error can be found in the logs. With containers:
`podman logs -f margix-app-1`.

## Health checks

- `GET /api/health` — 200 while the process is up (liveness).
- `GET /api/ready` — 200 when the database answers, otherwise 503 (readiness).
- `SELECT * FROM v_stock_balance_drift;` must return no rows: the stock
  projection always equals the sum of the ledger.
- The dashboard's "Needs attention" panel lists failed syncs, pending
  approvals, low stock and missing Tally mappings.
