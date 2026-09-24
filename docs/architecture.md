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
scripts/tally-sync.ts        CLI for a scheduler: one Tally sync pass
docs/                        Architecture and operational docs
tests/
  helpers/                   Test DB setup/reset, factories, route-calling helper
  unit/<area>/               Pure logic, no database
  integration/<module>/      Real Postgres (margix_test), mirrors server/modules
src/
  proxy.ts                   Next 16 proxy: optimistic session-cookie gate (no DB)
  app/                       Next.js App Router — routing only
    layout.tsx, globals.css  Root layout; Tailwind v4 theme tokens
    (auth)/login/            Public pages
    (app)/                   Authenticated shell (layout reads the session → dynamic)
      <feature>/page.tsx     Server components: auth guard + queries + render
    api/v1/**/route.ts       Versioned HTTP API, one-liners over modules
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
    search-params.ts         Parses page searchParams with the validation schemas
  server/                    Server-only code
    config/env.ts            Validated environment
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
| `inventory`   | Ledger posting (`postMovement(s)`), stock projection, low-level reversal, batches, stock & ledger queries |
| `documents`   | Document numbers (`GRN-2627-00001`), idempotent creation, posted-document status |
| `audit`       | Audit log writes (in-transaction) and reads |
| `masters`     | SKUs, godowns, suppliers, customers, categories, UOMs |
| `users`       | User administration |
| `purchasing`  | Purchase orders and GRNs |
| `dispatch`    | Outward dispatch |
| `adjustments` | Adjustment requests, approval/rejection (maker/checker) |
| `opening`     | Opening balances |
| `reversals`   | Reversal use case: counter-entry + document side effects + Tally + audit |
| `tally`       | Sync queue, worker, voucher builder, Tally client interface |
| `dashboard`   | Cross-module read model for the dashboard |

`inventory` is the only module that writes `inventory_ledger` / `stock_balance`.
Document modules depend on `inventory`, never the other way round;
`reversals` orchestrates the document-specific effects.

## Concurrency model

READ COMMITTED with explicit locks, always taken in this order to avoid deadlocks:

1. the owning document row (`purchase_order`, `adjustment`, …) — `lockRowForUpdate`
2. the ledger entry being reversed
3. `stock_balance` rows, sorted by (sku, godown, batch)

Stock decreases are a single conditional `UPDATE … WHERE quantity + delta >= 0`;
state transitions are conditional updates; one reversal per entry is enforced by
a unique index. `withTx` retries deadlocks/serialisation failures.

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
