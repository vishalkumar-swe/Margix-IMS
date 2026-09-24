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
scripts/                     CLI entry points: tally-sync.ts (one sync pass), db-grants.ts
ops/                         Deployment assets
  postgres/                  app-role-grants.sql; init/ hook creating the app login in containers
  backup/                    backup.sh (pg_dump + retention), verify-restore.sh (restore check)
  systemd/                   Timers for the Tally sync and nightly backups
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
    (print)/                 Chrome-less printable documents (GRN note, delivery challan)
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
    format.ts, dates.ts      Display formatting (exact decimals, IST dates)
    options.ts               Serialisable picker shapes passed to client forms
    csv.ts                   RFC 4180 CSV parser used by the imports
    search-params.ts         Parses page searchParams with the validation schemas
  server/                    Server-only code
    config/env.ts            Validated environment; config/company.ts (print letterhead)
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
| `documents`   | Document numbers (`GRN-2627-00001`), idempotent creation, posted-document status |
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
| `alerts`      | Reorder rules and low-stock alerts (evaluated by the inventory engine) |
| `reports`     | Stock summary / daily inventory, movements, slow & dead stock, CSV layouts |
| `tally`       | Sync queue, worker, voucher builder, XML wire format, Tally clients |
| `dashboard`   | Cross-module read model for the dashboard and exceptions |

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
