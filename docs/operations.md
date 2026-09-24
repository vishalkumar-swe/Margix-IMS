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

## Notifications

Low-stock and slow-moving alerts are announced in-app (the bell in the
header), by e-mail and by WhatsApp. Administrators configure them under
**Administration → Notifications**: per alert type on/off, immediate or a
daily digest at a set IST time, which channels, and the recipients (in-app by
role and/or named users, e-mail addresses, WhatsApp numbers). The same screen
sets the slow / dead stock days (the `SLOW_STOCK_DAYS` / `DEAD_STOCK_DAYS`
environment values are only the defaults) and the time of the daily
slow-moving scan, shows each channel's status with a **Send test** button,
and lists recent deliveries with their outcome (failed ones can be retried).

### The worker

Messages are queued with the stock change that raised the alert and sent by
the notify worker, one pass per run (`npm run notify:run`). Each pass runs
the once-a-day jobs that are due (slow-moving scan, digests), then delivers
queued messages. Run it every minute (containers: the `notify` service in
`deploy/compose.prod.yml`; Railway: a cron service, see
[deploy/RAILWAY.md](../deploy/RAILWAY.md)); with systemd:

```bash
cp ops/systemd/margix-notify.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now margix-notify.timer
```

Without the worker nothing is sent — not even in-app notifications. Concurrent
runs are safe (`FOR UPDATE SKIP LOCKED`); failures are retried after 2, 4, 8 …
up to 60 minutes, at most 6 times; exit code 2 means some deliveries failed.

### Channels and log-only mode

A channel whose settings are missing runs **log-only**: nothing is sent, the
delivery is recorded as *skipped: not configured* and the would-be message is
logged. In-app needs no settings. Set the variables on the app (for Send test
and the status display) and on the worker.

**E-mail (SMTP)** — `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (`true` only
for port 465), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, and `APP_URL` so
messages link back to the app. With Gmail / Google Workspace:

1. Turn on 2-Step Verification for the sending account
   (Google Account → Security).
2. Create an app password: Google Account → Security → 2-Step Verification →
   **App passwords** (or https://myaccount.google.com/apppasswords), name it
   "Margix IMS", copy the 16-character password.
3. Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`,
   `SMTP_USER=<the address>`, `SMTP_PASSWORD=<the app password, no spaces>`,
   `SMTP_FROM="Margix IMS <the address>"`. Gmail sends only as that address
   (or its configured aliases) and limits volume (about 500 recipients a day
   for personal accounts); use your provider's SMTP relay for more.

**WhatsApp (Meta WhatsApp Cloud API)** — messages a business starts must use a
template Meta has approved, so Margix sends every WhatsApp message as a
template:

1. In Meta for Developers create an app of type **Business**, add the
   **WhatsApp** product and connect (or create) a WhatsApp Business Account.
   Add and verify the sender phone number; note its **Phone number ID**
   (WhatsApp → API Setup).
2. Create a permanent token: Business Settings → Users → **System users** →
   add a system user (Admin), assign the app and the WhatsApp account with
   full control, **Generate token** with `whatsapp_business_messaging` and
   `whatsapp_business_management`. (The 24-hour token on API Setup is only
   for trying things out.)
3. In WhatsApp Manager → Message templates, create two templates in category
   **Utility**, language English (`en`), and wait for approval:
   - low stock, e.g. name `low_stock_alert`, body
     `Low Stock Alert: Product {{1}}, Current Stock: {{2}}, Minimum Required: {{3}}, Action Required: Reorder stock.`
     (Margix fills {{1}} product and godown, {{2}} current stock, {{3}} minimum,
     units included);
   - summary, e.g. name `stock_summary`, body `Margix IMS: {{1}}` (used for
     digests, slow-moving stock and tests; one line of text).
4. Set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_TEMPLATE_LOW_STOCK=low_stock_alert`,
   `WHATSAPP_TEMPLATE_SUMMARY=stock_summary` and `WHATSAPP_TEMPLATE_LANGUAGE`
   (the template's language code, e.g. `en` or `en_US`).
5. Recipients are entered with the country code (+91 98765 43210) and must
   have agreed to receive messages from your business. Until the app is
   published, Meta only delivers to numbers added as test recipients.

A template that is missing or not yet approved fails with the API's message
(e.g. "Template name does not exist") and is not retried; fix it and use
**Retry** on the delivery.

### Deduplication and frequency

Only a newly **raised** alert is notified: one ACTIVE low-stock alert exists per
product × godown, and later postings while it stays active update it without
notifying again. It is raised when stock reaches or falls below the reorder
level and resolved when stock recovers above it. With *daily digest*, nothing
is sent on raise; once a day at the digest time one summary of all active
alerts goes out. Slow-moving alerts are raised by the daily scan (stock idle
for at least the slow-moving days) and resolved by the item's next movement;
*immediate* then means one summary of the newly identified items right after
the scan.

## Daily checklist

On the first page a user opens each day (IST) a checklist pops up with what
needs attention — low and slow-moving stock, pending purchase orders,
invoices awaiting dispatch, partial dispatches, outstanding invoices, recent
returns, adjustments awaiting approval, Tally and notification failures —
each Completed, Pending, Overdue or Critical, plus administrator-defined tasks
(e.g. payment follow-ups: there is no payments module) that each user ticks
off per day. Users reopen it from the header or the dashboard; before sign-out
it lists unresolved items. **Administration → Daily checklist** switches system
items, the popup and the sign-out check on or off, and manages the tasks.

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
