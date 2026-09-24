# Margix IMS — Architecture & Code Layout

This document is the contract for where code lives. If a new file does not fit
one of the homes below, the structure is discussed first — files are never
added ad hoc.

## Principles

1. **The ledger is the source of truth.** Stock is never written directly;
   every change is an immutable `inventory_ledger` row with a **signed**
   quantity (a DB CHECK ties the sign to the movement type). `stock_balance` is
   a projection updated in the same transaction, so `SUM(ledger) = balance`
   always holds (`v_stock_balance_drift` must be empty).
2. **Layered, one direction only:** `app/` (routing) → `server/modules/*`
   (business logic) → `server/db` (Prisma). Client components never import
   `@/server/*`; server code never imports React components.
3. **Thin edges.** Route handlers and pages parse input, call a module, and
   render/serialise. No business rules in `app/`.
4. **One implementation per rule.** Stock posting, permissions, document
   numbering, validation and error mapping each exist in exactly one place.
5. **Integrity at the database too** (spec §16.5). CHECK constraints, composite
   foreign keys and triggers back up every invariant the services enforce:
   append-only ledger/audit, reversal must mirror its original, no negative
   stock, maker ≠ checker.

## Directory layout

```
prisma/
  schema.prisma              Data model
  migrations/                Versioned SQL; hand-reviewed (created with --create-only).
                             The init migration appends CHECKs, triggers and the drift view.
  seed.ts                    Idempotent seed — posts stock through the real services
scripts/                     CLI entry points: tally-sync.ts (one sync pass), notify.ts (one
                             notification worker pass), db-grants.ts
ops/                         Deployment assets
  postgres/                  app-role-grants.sql; init/ hook creating the app login in containers
  backup/                    backup.sh (pg_dump + retention), verify-restore.sh (restore check)
  systemd/                   Timers for the Tally sync, the notification worker and nightly backups
Dockerfile                   Production images ("app": standalone server; "tools": migrations,
                             grants, seed, Tally worker)
deploy/                      Home-server stack: compose.prod.yml (Postgres, app, worker, Tailscale
                             sidecar with Funnel), ts-serve.json, systemd unit, RUNBOOK.md
.github/workflows/ci.yml     Lint, typecheck, migration drift, tests, build, image build
docs/                        Architecture and operations docs
public/templates/            CSV import templates
tests/
  helpers/                   Test DB setup/reset, factories, route-calling helper
  unit/<area>/               Pure logic, no database
  integration/<module>/      Real Postgres (margix_test), mirrors server/modules
e2e/                         Playwright browser tests against a production build (margix_e2e)
src/
  proxy.ts                   Next 16 proxy: optimistic session-cookie gate (no DB)
  app/                       Next.js App Router — routing only
    layout.tsx, globals.css  Root layout; Tailwind v4 theme tokens
    (auth)/login/            Public pages
    (app)/                   Authenticated shell (layout reads the session → dynamic)
      <feature>/page.tsx     Server components: auth guard + queries + render
    (print)/                 Chrome-less printable documents (tax invoice, purchase order, GRN note,
                             delivery challan) and product barcode labels
    api/v1/**/route.ts       Versioned HTTP API, one-liners over modules
    api/health, api/ready    Liveness (process up) and readiness (database reachable)
  components/
    ui/                      Design-system primitives (button, form controls, table, dialog…)
    layout/                  App shell: navigation config, sidebar, user menu, page header
    shared/                  App-wide composed pieces: status badges, quantity, filter bar
  features/<domain>/         Feature UI (forms, dialogs, tables) for one domain
  hooks/                     Client hooks (use-api-mutation)
  lib/                       Isomorphic code, safe on client and server
    validation/<domain>.ts   Zod schemas shared by forms, pages (search params) and the API
    permissions.ts           RBAC matrix (spec §4.2)
    api-client.ts            Typed fetch wrapper for /api/v1
    format.ts, dates.ts      Display formatting (exact decimals, money, IST dates)
    analytics.ts             Analytics periods (presets, Indian FY), time buckets, % change
    options.ts               Serialisable picker shapes passed to client forms
    csv.ts                   RFC 4180 CSV parser used by the imports
    tax.ts                   GST arithmetic in paise (see "Pricing and GST"); gst-states.ts state codes
    amount-in-words.ts       Rupees in words, Indian numbering (lakh, crore)
    barcode.ts               EAN-13 check digits, internal codes, barcode validation and matching
    document-codes.ts        Document QR payload format and scanned-code parsing
    search-params.ts         Parses page searchParams with the validation schemas
  server/                    Server-only code
    config/env.ts            Validated environment; config/company.ts (letterhead, GST state)
    print/barcodes.ts        Barcode (Code 128 / EAN-13) and QR SVGs for printed documents and labels
    observability/logger.ts  JSON-lines logger (LOG_LEVEL); access log from apiRoute
    db/                      Prisma client, transactions (withTx + retry), row locks,
                             Postgres error decoding, Decimal/JSON helpers
    errors.ts                AppError hierarchy with stable error codes (spec §10.4)
    actor.ts                 Who is acting (for audit and maker/checker)
    http/                    apiRoute wrapper + response envelope
    auth/                    Passwords (scrypt), DB sessions, cookie, current user, login
    modules/<domain>/        Business domains:
      <domain>.service.ts      Commands (mutations), always transactional
      <domain>.queries.ts      Read models for pages and API
      Larger modules split by sub-entity (e.g. grn.service.ts, ledger.service.ts)
```

### Domain modules (`src/server/modules`)

| Module        | Responsibility |
|---------------|----------------|
| `inventory`   | Ledger posting (`postMovement(s)`), stock projection, low-level reversal, batches, stock & ledger queries, FEFO allocation (`fefo.ts`), unit conversion (`units.ts`) |
| `documents`   | Document numbers (`GRN-2627-00001`), idempotent creation, posted-document status, GST terms and priced views of documents (`pricing.ts`), lookup by scanned number / QR (`documents.queries.ts`) |
| `audit`       | Audit log writes (in-transaction) and reads |
| `masters`     | SKUs (incl. alternate units), godowns, suppliers, customers, categories, UOMs |
| `imports`     | All-or-nothing CSV import of SKUs and opening stock with per-line errors |
| `users`       | User administration |
| `purchasing`  | Purchase orders (incl. short-close) and GRNs |
| `invoices`    | Customer invoices and dispatched/remaining quantities |
| `dispatch`    | Outward dispatch, optionally against an invoice |
| `transfers`   | Godown-to-godown transfers (TRANSFER_OUT + TRANSFER_IN) |
| `returns`     | Customer returns (against a dispatch) and supplier returns (against a GRN) |
| `adjustments` | Adjustment requests, approval/rejection (maker/checker) |
| `opening`     | Opening balances |
| `reversals`   | Reversal use case: counter-entries + document side effects + Tally + audit |
| `alerts`      | Reorder rules and low-stock alerts (evaluated by the inventory engine); the daily slow-moving scan |
| `reports`     | Stock summary / daily inventory, movements, slow & dead stock, CSV layouts |
| `analytics`   | BI read models (inventory, sales, purchasing, operations) and their CSV layouts; see [Analytics](#analytics) |
| `tally`       | Sync queue, worker, voucher builder, XML wire format, Tally clients |
| `dashboard`   | Cross-module read model for the dashboard and exceptions |
| `notifications` | Notification rules, the transactional outbox and its worker, channel providers (in-app, e-mail, WhatsApp), digests, the bell |
| `checklist`   | Daily checklist: system items computed per role, administrator tasks and completions, popup "seen" marker |
| `settings`    | Admin-editable settings store (`app_setting`), e.g. slow / dead stock days |

`inventory` is the only module that writes `inventory_ledger` / `stock_balance`,
and it re-evaluates `alerts` after every posting, so an alert can never
disagree with stock. Document modules depend on `inventory`, never the other
way round; `reversals` orchestrates the document-specific effects.

## Concurrency model

READ COMMITTED with explicit locks, always taken in this order to avoid deadlocks:

1. the owning document row(s) (`purchase_order` → `grn`, `invoice` → `outward`,
   `adjustment`, `transfer`, …) — `lockRowForUpdate`
2. the ledger entry being reversed
3. `stock_balance` rows, sorted by (sku, godown, batch)

Stock decreases are a single conditional `UPDATE … WHERE quantity + delta >= 0`;
state transitions are conditional updates; one reversal per entry is enforced by
a unique index. `withTx` retries deadlocks/serialisation failures.

## Database access

- The app connects as a least-privilege login (`margix_app`): row access only,
  no TRUNCATE, no UPDATE/DELETE on the ledger or audit log.
- Migrations and `npm run db:grants` use the schema owner (`DIRECT_DATABASE_URL`).
- See [operations.md](operations.md).

## Units of measure

Stock, the ledger and every stock document are kept in the SKU's **base unit**.
A SKU may also have alternate units (`sku_unit`: 1 BOX = 24 PCS). Purchase
orders and invoices may be entered in one; the line then stores the base
quantity plus an as-entered snapshot (`entry_uom_id`, `entry_quantity`,
`entry_factor`, with a CHECK that they multiply to the base quantity), and the
rate is per entered unit. Changing a factor later never alters past documents.
A conversion that is not exact in the base unit (0.1 BOX = 2.4 PCS) is refused.

## Pricing and GST

All tax arithmetic lives in `lib/tax.ts` — one isomorphic implementation used by
the forms (live totals), the detail pages, the printed documents and the server
(audit totals). Money is integer paise (`bigint`), never a float:

- line gross = quantity × rate (the quantity as entered; the rate is per the
  entered unit — a delivery counted in base units divides by the unit factor),
  discount = `discount_percent` of gross, taxable = gross − discount;
- intra-state: CGST = SGST = taxable × rate/2, each rounded; inter-state:
  IGST = taxable × rate; rounding is half-up to the paisa, per line;
- document totals are sums of line values; `other_charges` (freight, packing…)
  are added after tax and are not taxed.

Intra vs inter is decided when a purchase order or invoice is saved: the
company's state (`COMPANY_GSTIN`, else `COMPANY_STATE_CODE`) against the
party's (its GSTIN, else its `state_code`; `lib/gst-states.ts`). If either is
unknown the document is intra-state and the form says so. `tax_type`,
`place_of_supply` (the customer's state on a sale, ours on a purchase) and
each line's `hsn_code` and `gst_rate` are stored on the document, so later
master edits never change it. GRN and delivery notes are valued at the
prices of the order / invoice lines they fulfil.

## Barcodes and scanning

- **Products:** `sku.barcode` is an EAN-13 (check digit verified) or any
  Code 128 value, unique. New products get an internal EAN-13 (prefix 2, the
  in-store range) from the `BARCODE:EAN13` counter, skipping values already
  used; admins can type or regenerate one, or fill in all missing ones.
- **Documents:** every printed document carries a QR code
  `MARGIX|<type>|<number>|<date>|<party GSTIN or ->|<grand total or ->`
  (`lib/document-codes.ts`) and a Code 128 barcode of its number.
- **Lookups:** `GET /api/v1/skus/lookup?code=` (barcode, else SKU code) and
  `GET /api/v1/documents/lookup?code=` (number or QR payload → `{ type, id,
  number, url }` across PO, GRN, INV, DSP, TRF, SRN, PRN).
- **Scanning UI:** `features/scan/scan-input.tsx` serves keyboard-wedge
  scanners (USB/Bluetooth: fast keystrokes + Enter) and, where the browser has
  `BarcodeDetector`, the camera. It is used by the PO/invoice and
  dispatch/transfer line editors, the return forms, the dispatch
  verification panel, the label picker and the header scan box.

## Observability

- Every API request is logged as one JSON line (`requestId`, method, path,
  status, duration, user). An incoming `x-request-id` is honoured, and the id
  is returned in the response and in error envelopes.
- Unexpected errors are logged with their stack; expected business errors are not.
- `/api/health` (liveness) and `/api/ready` (runs `SELECT 1`; 503 when the
  database is unreachable) are public, for load balancers and container checks.

## Navigation performance

Every page is dynamic (it reads the session), renders in 10–25 ms, and is
reached over a network with a real round trip. Navigation is tuned for that:

- **Intent prefetch** (`components/layout/navigation-intent.tsx`): pointer over,
  focus on or touch of any in-app link prefetches the whole page, data
  included (`router.prefetch(href, { kind: "full" })`). Hover-to-click hides
  the round trip, so the page appears as the click lands.
- **Viewport prefetch stays on** (the `<Link>` default): it is cheap and gives
  the router each route's tree and JavaScript ahead of time; switching it off
  measurably doubled un-hovered navigations.
- **Freshness:** prefetched pages are reused for at most 30 s
  (`staleTimes.static`, the minimum); visited pages are always refetched
  (`staleTimes.dynamic: 0`). After a mutation, forms call `pushFresh()`
  (`lib/navigation.ts`), which clears the client cache in the same round trip
  as the navigation, so data prefetched before a change is never shown after it.
- **Feedback:** `components/layout/navigation-progress.tsx` shows a thin top bar
  for navigations still in flight after 80 ms.
- **No route-level `loading.tsx`.** A fallback, once shown, stays up for at least
  300 ms (React's reveal throttle) — slower than simply waiting for a fast page.
  Add one only to a route whose server render is genuinely slow.
- **Client bundle:** client components import value lists from `lib/enums.ts`,
  never from `lib/validation/*`, so zod stays out of the browser bundle.

## Live updates

Open screens refresh themselves when anyone commits a change:

1. Every mutation already writes an `audit_log` row in its transaction. A
   trigger (migration `live_change_notifications`) calls `pg_notify` on the
   `margix_changes` channel — delivered only on commit, never on rollback.
   Sign-in activity is excluded; Tally job status changes notify separately.
2. `server/realtime/change-feed.ts` holds one `LISTEN` connection per process
   (node-postgres; Prisma cannot LISTEN) and fans notifications out, with
   reconnect/backoff and a `resync` event after a reconnect.
3. `GET /api/v1/events` streams them as Server-Sent Events to signed-in users,
   with a 25 s heartbeat that also ends the stream when the session ends.
   Events name only what changed — never data.
4. `components/layout/live-updates.tsx` debounces events and calls
   `router.refresh()`, which re-renders the page with fresh data while keeping
   form input, open dialogs and scroll. Hidden tabs catch up when shown.

Confirmations that must survive a refresh belong to the page, not to a form
that may unmount (e.g. `?posted=GRN-…` on the purchase order page).

## Analytics

`/analytics` (permission `report.view`) has four tabs — Overview, Inventory,
Sales, Purchasing. The tab, period and filters live in the URL, so every view
can be shared; each tab loads only its own figures.

- **Read models** in `server/modules/analytics/analytics.queries.ts`: one SQL
  aggregate per figure (`$queryRaw`), never a per-document loop. Money comes
  back rounded to 2 decimals and quantities as exact strings.
- **Periods and buckets** in `lib/analytics.ts` (pure, unit-tested): presets
  today / 7 d / 30 d / this month / this quarter / this financial year
  (April–March) / custom, all "to date" and in IST calendar days. Trends are
  daily up to 31 days, weekly (Monday-based) up to 183 days, monthly beyond;
  timestamps are bucketed with `AT TIME ZONE 'Asia/Kolkata'`. KPI changes
  compare with the previous period of equal length.
- **Charts** (`recharts`) are client components in `features/analytics/`,
  imported only by the analytics route, so the library is code-split away from
  every other page. Each chart has a "view as table" toggle; KPI sparklines are
  plain server-rendered SVG.
- **CSV**: `GET /api/v1/analytics/export?section=…` with the page filters
  (UTF-8 BOM for Excel).

Value definitions (the SQL fragments at the top of `analytics.queries.ts` are
the only place money is computed — change them there, e.g. for line discounts):

| Figure | Definition |
|--------|------------|
| Sales value | Invoice line entered quantity × rate (rate is per entered unit), excluding cancelled invoices, by invoice date. Before GST. |
| GST collected | Sales value × line GST rate ÷ 100. |
| Purchase value | PO line ordered (entered) quantity × rate on submitted POs (not draft, not cancelled), by order date. |
| Received value | GRN accepted base quantity ÷ entry factor × PO rate, by receipt date; reversed receipt lines excluded. |
| Pending PO value | (ordered − received) base quantity ÷ entry factor × rate on OPEN / PARTIALLY_RECEIVED POs, any date. |
| Inventory value | On-hand quantity × latest purchase cost per base unit (rate ÷ entry factor of the most recent submitted PO line with a rate). SKUs without one are counted as "no cost" and not valued. The comparison value is stock at the start of the period, rebuilt from the ledger at today's costs. |
| Stock movement | Inward = OPENING, INWARD, RETURN_IN; outward = OUTWARD, RETURN_OUT; adjustments = ADJUSTMENT, REVERSAL; valued at latest cost. Transfers are excluded (no change to company stock). |
| Fast-moving | Top SKUs by dispatched (OUTWARD) quantity in the period, reversed dispatch lines excluded. |
| Slow / dead | On-hand SKU × godown idle (no ledger movement) for SLOW_STOCK_DAYS ≤ days < DEAD_STOCK_DAYS / ≥ DEAD_STOCK_DAYS. Exclusive, unlike the reports, where "slow" includes dead. |
| Stock ageing | On-hand SKU × godown by days since last movement: 0–30, 31–60, 61–90, 91–180, over 180. |
| Low stock / out of stock | SKUs with an ACTIVE low-stock alert / ACTIVE SKUs with no stock in any godown. |

A new in-app notification is announced the same way (a statement trigger on
`notification`, migration `notifications_checklist`), so the bell's unread
count, rendered by the app layout, refreshes on every open screen.

## Notifications

```
 posting tx ─▶ evaluateStockAlerts ─▶ LOW_STOCK alert raised? ─▶ enqueueNotification ─▶ notification_outbox
                                      (one ACTIVE per SKU×godown×type; notify on raise only)  (same transaction)
 notify worker (scripts/notify.ts, every 1–5 min):
   1. slow-moving scan, once per IST day after its time ─▶ SLOW_MOVING alerts (+ outbox if "immediate")
   2. daily digests, once per IST day per rule at its time ─▶ outbox
   3. deliver: claim due rows (FOR UPDATE SKIP LOCKED, 2-min lease) ─▶ channel provider ─▶ SENT / SKIPPED / FAILED
```

- **Transactional outbox.** Messages are rendered and written to
  `notification_outbox` in the transaction that raises the alert, one row per
  channel × recipient, so a rolled-back change never notifies anyone and a
  committed one is never lost. Delivery happens later, outside any
  transaction, so a slow SMTP server or WhatsApp outage never blocks stock.
- **Worker** (`notification-delivery.service.ts`) follows the Tally queue:
  claim with `SKIP LOCKED` under a lease (a crashed worker's rows are
  re-claimed), exponential backoff (2, 4, 8 … 60 minutes), at most 6 automatic
  attempts, every attempt logged in `notification_attempt`. Permanent errors
  (SMTP 5xx, WhatsApp 400/404) stop at once; administrators can retry.
- **Channels** (`notifications/channels/`) implement one interface
  (`send()` never throws, returns SENT / SKIPPED / FAILED + retryable):
  in-app (a `notification` row), e-mail (SMTP via nodemailer), WhatsApp (Meta
  Cloud API template messages). A channel without credentials runs
  **log-only**: the row becomes SKIPPED "skipped: not configured".
- **Rules** (`notification_rule`, one per alert type; defaults in code when
  absent): enabled, frequency (immediate / daily digest at an IST time),
  channels, in-app roles and users, e-mail addresses, WhatsApp numbers.
  Recipients are resolved when the message is queued.
- **Once-a-day jobs** claim their day in `scheduled_job_run` with a
  conditional upsert inside the job's transaction, so concurrent workers run
  each job once and a failed run is retried on the next pass.
- **Slow-moving alerts** reuse `stock_alert` (`alert_type = SLOW_MOVING`,
  `days_idle`): raised by the scan for stock idle ≥ the configured days,
  resolved by the next movement of that SKU in that godown or when a later
  scan no longer finds it.

## Integrations

All outside systems (Tally, e-mail, WhatsApp, webhooks) implement one
`Integration` contract (`src/server/integrations/integration.types.ts`) and are
listed in `registry.ts`, which drives the Integrations admin screen and
`/api/v1/integrations`. Work is queued in an outbox table in the business
transaction and delivered by a worker (`FOR UPDATE SKIP LOCKED`, shared backoff
in `retry.ts`, outbound HTTP through `http.ts`). Webhook events are derived from
audit records (`webhook-emitter.ts`), so every audited business action can be
published with a two-line change. Details and the how-to: [integrations.md](integrations.md).

## Daily checklist

`checklist.queries.ts` computes a user's checklist for the current IST day:
system items (low stock, slow-moving, pending POs, invoices awaiting dispatch,
partial dispatches, outstanding invoices, recent returns, pending approvals,
Tally and notification failures), each shown only to roles with the
permission to open its page and derived from live data (Completed when there
is nothing to do; Critical / Overdue / Pending otherwise), followed by the
administrator tasks for the user's role (`checklist_task`), ticked per user per
day (`checklist_task_completion`) and overdue after their due time. The app
layout opens the popup on the first page of the day (`checklist_view` records
that it was shown), the header and dashboard reopen it, and sign-out lists
unresolved items first when enabled. Configuration lives in `app_setting`
(`checklist`).

## Naming conventions

- Files `kebab-case.ts(x)`; React components export `PascalCase`.
- Zod schemas `<thing>Schema`; inferred types `<Thing>Input`.
- Errors are `AppError` subclasses with a stable `code`.
- DB: snake_case tables/columns via `@@map`/`@map`; Prisma models PascalCase.
- Quantities are `Decimal(18,3)` in the DB and decimal **strings** everywhere
  else — never JavaScript floats.

## Request flow

```
Client form (features/*) ──apiRequest──▶ app/api/v1/.../route.ts
      apiRoute(): session → permission → same-origin → zod
          ▼
  server/modules/<domain>/*.service.ts   withTx: lock → validate → number → post → status → Tally queue → audit
          ▼
  server/modules/inventory (postMovements / reverseLedgerEntry)  ──▶ Postgres (CHECKs, triggers)

Server page (app/(app)/...) ──▶ requirePagePermission ──▶ server/modules/<domain>/*.queries.ts ──▶ Postgres
```
