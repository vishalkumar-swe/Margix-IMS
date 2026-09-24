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

## Health checks

- `SELECT * FROM v_stock_balance_drift;` must return no rows: the stock
  projection always equals the sum of the ledger.
- The dashboard's "Needs attention" panel lists failed syncs, pending
  approvals, low stock and missing Tally mappings.
