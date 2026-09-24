# Runbook — Margix IMS on Railway

Railway runs the same `Dockerfile` as the home server. It builds the final
stage, which the `TARGET` variable selects (`app` by default, `tools` for the
Tally worker).

```
  browser ──HTTPS──▶ Railway edge ──▶ web (Next.js, TARGET=app) ──private network──▶ Postgres
                                       tally-sync (cron, TARGET=tools) ──────────────┤
                                       notify (cron, TARGET=tools) ──────────────────┘
```

All services run in **Asia Southeast (Singapore)**, the Railway region closest
to India.

## Services

| Service | Source | Settings |
|---|---|---|
| `Postgres` | Railway Postgres template | volume at `/var/lib/postgresql/data` |
| `web` | this repo, Dockerfile | pre-deploy `sh ops/railway/pre-deploy.sh`, healthcheck `/api/ready`, public domain |
| `tally-sync` | this repo, Dockerfile, `TARGET=tools` | start `npx tsx scripts/tally-sync.ts`, cron `*/5 * * * *`, restart policy never |
| `notify` | this repo, Dockerfile, `TARGET=tools` | start `npx tsx scripts/notify.ts`, cron `*/5 * * * *`, restart policy never |

### `web` variables

| Variable | Value |
|---|---|
| `DIRECT_DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (schema owner: migrations, grants) |
| `APP_DB_PASSWORD` | random letters/digits (`openssl rand -hex 24`) |
| `DATABASE_URL` | `postgresql://margix_app:<APP_DB_PASSWORD>@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}` |
| `COMPANY_NAME`, `COMPANY_ADDRESS`, `COMPANY_GSTIN` | letterhead on printed notes |
| `TALLY_MODE` | `mock` until Tally Prime is reachable from Railway |
| `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES` | `20` / `5` while testing; `5` / `15` for go-live |
| `LOG_LEVEL` | `info` |

`tally-sync` uses the same database variables (reference them from `web`)
plus `TARGET=tools`.

### `notify` (notifications cron)

One pass per run: the daily jobs that are due (slow-moving scan at the
configured time, daily digests) and delivery of queued in-app, e-mail and
WhatsApp messages. Railway cron runs at most every 5 minutes, so a digest
set for 09:00 goes out by about 09:05 IST; immediate alerts reach the bell
and inboxes within 5 minutes. Deliveries are claimed with `SKIP LOCKED`, so an
overlapping run never sends a message twice.

| Variable | Value |
|---|---|
| `TARGET` | `tools` |
| `DATABASE_URL`, `DIRECT_DATABASE_URL` | reference `web`'s |
| `APP_URL` | the public `https://…` address of `web` (links in e-mails) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | e-mail (Gmail: `smtp.gmail.com`, `587`, `false`, address, app password) |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp Cloud API |
| `WHATSAPP_TEMPLATE_LOW_STOCK`, `WHATSAPP_TEMPLATE_SUMMARY`, `WHATSAPP_TEMPLATE_LANGUAGE` | approved template names, language (`en`) |

Set the same notification variables on `web` too: the "Send test" button on
Administration → Notifications sends from the web service, and the channel
status shown there reads them. Blank values mean that channel runs log-only.

## How a deploy works

1. A push to the connected branch builds the image.
2. The **pre-deploy command** (`ops/railway/pre-deploy.sh`, run from the new
   image) applies pending migrations, creates or updates the least-privilege
   `margix_app` login, and re-applies its grants. If it fails, the new version
   is not started and the old one keeps serving.
3. The new version starts; Railway switches traffic once `/api/ready` answers.

## First install: seed

The app image carries no seed tooling, so seed once from a checkout, against
the database's public URL (Postgres → Variables → `DATABASE_PUBLIC_URL`):

```bash
DATABASE_URL="<DATABASE_PUBLIC_URL>" DIRECT_DATABASE_URL="<DATABASE_PUBLIC_URL>" \
NODE_ENV=production SEED_ADMIN_EMAIL=admin@margix.local SEED_ADMIN_PASSWORD='<strong password>' \
SEED_SAMPLE_DATA=true npx prisma db seed
```

`SEED_SAMPLE_DATA=true` loads the sample masters and stock for acceptance
testing; leave it out for real go-live data.

## Operations

- Logs: Railway → service → Deployments → logs (JSON lines, one per API request).
- Health: `https://<domain>/api/health` (process) and `/api/ready` (database).
- Backups: Railway Postgres → Backups, or `ops/backup/backup.sh` with the
  `PG*` variables set from `DATABASE_PUBLIC_URL`.
- Live updates use one `LISTEN` connection per web replica; they work with
  several replicas.
