# Margix IMS

Ledger-based inventory management for multi-godown, batch-tracked stock, with
approval workflows and Tally Prime synchronisation.

**Core rule:** stock is never edited. Every change is an immutable ledger entry
with a signed quantity; current stock is derived from the ledger. Mistakes are
corrected with reversal entries, and the original stays visible.

```
Stock = Opening + Inward + Transfer in + Return in
      − Outward − Transfer out − Return out
      ± Adjustment ± Reversal
```

## Features (V1)

| Area | What it does |
|------|--------------|
| Stock | Live balances by SKU × godown × batch, expiry, FEFO-ordered batch pickers and one-click FEFO picking (expired batches are skipped) |
| Units | Alternate purchase/sales units per SKU (1 BOX = 24 PCS); POs and invoices can be entered in them while stock stays in the base unit |
| Ledger | Every movement with running balance, reference document and user; reversals linked both ways |
| Purchasing | Purchase orders (draft → open → partially/fully received, short-closed or cancelled); GRNs with received / accepted / rejected quantities; only accepted stock is booked; over-receipt blocked |
| Invoices & dispatch | Customer invoices; batch-level dispatch, optionally against an invoice with partial-dispatch tracking (dispatched / remaining, over-dispatch blocked); strict stock validation — negative stock is impossible (enforced in the database too) |
| Transfers | Move batches between godowns in one atomic transaction (TRANSFER_OUT + TRANSFER_IN); reversing either leg reverses both |
| Returns | Customer returns against a dispatch (RETURN_IN) and supplier returns against a GRN (RETURN_OUT), limited to what was delivered / accepted |
| Adjustments | Request → review → post, with maker ≠ checker enforced; reasons DAMAGE, THEFT, EXPIRY, COUNTING_ERROR, OTHER |
| Reversals | Counter-entries that keep documents consistent (PO received quantities, document status) |
| Opening stock | Go-live balances per godown |
| Imports | CSV import of SKUs and opening stock with downloadable templates; the whole file is checked first and nothing is imported until every line is valid |
| Printing | Printable tax invoices, purchase orders, GRN notes and delivery challans with company letterhead, full GST breakdown, amount in words, a QR code (top right) and a Code 128 barcode of the document number (bottom); product barcode labels (3 × 8 per A4) |
| Pricing & GST | Line discounts, other charges (freight, packing) and live totals on POs and invoices; CGST + SGST within the state, IGST across states — decided from the company and party GST states and fixed on the document; per-line and document breakdown on screen and in print |
| Barcodes & scanning | Product barcodes (EAN-13 or Code 128; internal EAN-13s generated automatically), scan-to-add on POs and invoices, scan-to-pick on dispatches and transfers, dispatch verification by scan (matched / short / extra), returns started by scanning the original document, and a header scan box that opens any scanned document or product. Works with USB/Bluetooth scanners everywhere and the camera where the browser supports it |
| Alerts | Reorder rules per SKU × godown; low-stock alerts raised (at or below the minimum) and resolved in the same transaction as the stock change, never duplicated; slow-moving alerts from a daily scan |
| Notifications | Low-stock and slow-moving alerts in-app (bell with unread count), by e-mail (SMTP) and WhatsApp (Meta Cloud API); per alert type: on/off, immediate or daily digest, channels and recipients; queued in the same transaction as the alert (outbox) and delivered with retries; channels without credentials run log-only; Send test per channel |
| Slow-moving stock | Slow / dead stock days set by administrators; report rows link to the product, its stock, sales history (dispatches, invoices), purchase history (POs, GRNs) and a pre-filled reorder PO |
| Daily checklist | Popup on the first sign-in of the day: low / slow stock, pending POs, invoices awaiting dispatch, outstanding invoices, returns, approvals, sync failures and administrator tasks, each Completed / Pending / Overdue / Critical; reopen from the header or dashboard; unresolved items shown before sign-out |
| Reports | Stock summary and daily inventory (opening + inward − outward ± adjustments = closing), movement report, slow and dead stock — on screen and as CSV |
| Analytics | Business-intelligence dashboard at `/analytics`: inventory (value at latest cost, low/out-of-stock, fast/slow/dead, ageing, movement trends), sales (by product, customer, category; GST collected; daily/weekly/monthly trends), purchasing (by supplier, pending POs, purchase vs sales) and operational KPIs — period presets incl. Indian FY, comparison with the previous period, filters, CSV per section |
| Tally | Every posted document is queued; failures show a plain-language reason, back off and can be retried; a Tally outage never blocks stock operations |
| Live updates | Every open screen refreshes itself within a moment of anyone posting a change — no reload, typed input kept |
| Operations | JSON request logs with request ids, health and readiness endpoints, backups with restore verification, production container images |
| Security | Login with DB-backed sessions, role-based permissions (Admin, Store Manager, Warehouse Operator, Accounts, Management), self-service password change, audit trail screen, least-privilege database login |

The Tally integration ships a real Tally Prime XML client (`TALLY_MODE=xml`);
it is exercised against Tally's documented import format in tests and should be
verified against your Tally company before switching it on (see
[docs/operations.md](docs/operations.md)).

## Tech stack

Next.js 16 (App Router, React 19, Turbopack) · TypeScript · Prisma 5 · PostgreSQL 16 ·
Tailwind CSS 4 · Zod 4 · Vitest · Playwright.

See [docs/architecture.md](docs/architecture.md) for the code layout and design rules and
[docs/operations.md](docs/operations.md) for production deployment with containers, backups,
logs and health checks, database logins, the scheduled Tally sync and Tally setup.

## Getting started

### 1. Prerequisites

- Node.js 22 (`nvm install 22` — the repo has an `.nvmrc`)
- PostgreSQL 16. With rootless Podman:

  ```bash
  podman volume create margix_pgdata
  podman run -d --name margix-postgres \
    -e POSTGRES_USER=margix -e POSTGRES_PASSWORD=margix -e POSTGRES_DB=margix \
    -p 127.0.0.1:15432:5432 -v margix_pgdata:/var/lib/postgresql/data \
    docker.io/library/postgres:16-alpine
  podman exec margix-postgres createdb -U margix margix_test
  ```

  Or `docker compose up -d` / `podman compose up -d` with the included
  `docker-compose.yml`, then create the `margix_test` database the same way.

### 2. Configure

```bash
cp .env.example .env
podman exec margix-postgres psql -U margix -c "CREATE ROLE margix_app LOGIN PASSWORD 'change-me'"
```

Set `SEED_ADMIN_PASSWORD` and the `margix_app` password in `.env`. For tests,
create `.env.test` with `DATABASE_URL` and `DIRECT_DATABASE_URL` pointing at
`margix_test` as the schema owner (tests refuse any other database), plus
`APP_DATABASE_URL` with the `margix_app` login to run the privilege tests.

### 3. Install, migrate, seed, run

```bash
npm install         # also runs prisma generate
npm run db:deploy   # apply migrations, then the app-login grants
npm run db:seed     # idempotent: roles, admin, demo data, opening stock
npm run dev         # http://localhost:3000
```

Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. With
`SEED_DEMO_USERS=true` (development only) the seed also creates
`manager@`, `operator@`, `accounts@` and `management@margix.local`
(password `Margix@2026`) to try each role.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` / `build` / `start` | Develop / production build / serve |
| `npm run typecheck` | Generate Next route types and run `tsc` |
| `npm run lint` | ESLint |
| `npm test` | Unit + integration tests against `margix_test` |
| `npm run test:e2e` | Playwright browser tests against a production build (`npm run build` first) and `margix_e2e` |
| `npm run db:migrate` | Create/apply migrations (development) |
| `npm run db:deploy` | Apply migrations and grants (production) |
| `npm run db:grants` | Re-apply the least-privilege app-login grants (idempotent) |
| `npm run db:reset` | Drop, re-migrate, grant and re-seed the development database |
| `npm run db:seed` | Seed (safe to repeat) |
| `npm run tally:sync` | One Tally sync pass — schedule it with cron/systemd |
| `npm run notify:run` | One notification worker pass (slow-moving scan, digests, delivery) — schedule it every minute |
| `npm run db:backup` | Dump the database with retention (`ops/backup/backup.sh`) |
| `npm run db:verify-backup -- <dump>` | Restore a dump into a scratch database and check it |

## Environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Runtime connection — the least-privilege `margix_app` login |
| `DIRECT_DATABASE_URL` | Schema owner — used only by migrations and `db:grants` |
| `LOG_LEVEL` | `debug`, `info` (default), `warn` or `error` |
| `COMPANY_NAME`, `COMPANY_ADDRESS`, `COMPANY_GSTIN` | Letterhead on printed documents; the GSTIN's state decides CGST + SGST vs IGST |
| `COMPANY_STATE_CODE` | GST state code (e.g. `29`) when `COMPANY_GSTIN` is blank |
| `COMPANY_BANK_DETAILS` | Payment details printed on tax invoices |
| `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES` | Wrong passwords in a row before an account locks (default 5), and for how long (default 15 min) |
| `SESSION_TTL_HOURS` | Idle session timeout (sliding; sessions also end after 7 days) |
| `TALLY_MODE` | `mock` (accepts vouchers), `fail` (simulates an outage), `xml` (real Tally Prime) or `disabled` |
| `TALLY_URL`, `TALLY_COMPANY`, `TALLY_TIMEOUT_MS` | Tally Prime HTTP/XML server, company name and timeout (for `xml`) |
| `SLOW_STOCK_DAYS`, `DEAD_STOCK_DAYS` | Default days without movement before stock counts as slow / dead (administrators can change them in the app) |
| `APP_URL` | Public address of the app, for links in e-mails |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | E-mail notifications over SMTP (e.g. Gmail with an app password); blank = log-only |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Cloud API credentials; blank = log-only |
| `WHATSAPP_TEMPLATE_LOW_STOCK`, `WHATSAPP_TEMPLATE_SUMMARY`, `WHATSAPP_TEMPLATE_LANGUAGE` | Approved template names (low-stock alert; summaries) and their language (default `en`) |
| `NOTIFY_TIMEOUT_MS` | Timeout for one e-mail / WhatsApp delivery (default 15 s) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Initial administrator |
| `SEED_DEMO_USERS` | `true` to create one demo user per role (ignored in production) |

## API

Versioned under `/api/v1`, session-cookie authenticated. Every response uses one envelope:

```json
{ "success": true, "data": { } }
{ "success": false, "error": { "code": "INSUFFICIENT_STOCK", "message": "…", "details": { } } }
```

Business operations are explicit endpoints (e.g. `POST /purchase-orders/:id/grns`,
`POST /adjustments/:id/approve`, `POST /ledger/:id/reverse`); stock itself is
never writable. Quantities are exchanged as decimal strings.

## Testing

`npm test` rebuilds `margix_test` from migrations and runs the whole suite. It
includes the spec §14 worked scenario, concurrency tests (parallel dispatches,
receipts, invoice dispatches and reversals, concurrent approvals, overlapping
Tally runs), database guards (append-only ledger, sign CHECK, reversal trigger,
one active alert per SKU × godown, app-login privileges), report arithmetic,
the Tally XML format, and the role and response contract of the API.

`npm run test:e2e` drives the same worked scenario through a real browser, as
the roles that would do it (manager raises the PO, operator receives, dispatches
and requests the adjustment, manager approves and reverses). It rebuilds and
seeds `margix_e2e` (override with `E2E_DATABASE_URL`) and starts `next start`
on port 3100. First time: `npx playwright install chromium`.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, a migration-drift check,
the test suite, the build, the E2E test and both container image builds.

## Deployment

See [deploy/RUNBOOK.md](deploy/RUNBOOK.md): `deploy/compose.prod.yml` runs
Postgres, migrations, the app, the Tally and notification workers and a Tailscale sidecar that
publishes the app over HTTPS, with no host port.
