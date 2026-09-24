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

## Features (V1 · Phase 1)

| Area | What it does |
|------|--------------|
| Stock | Live balances by SKU × godown × batch, expiry, FEFO-ordered batch pickers |
| Ledger | Every movement with running balance, reference document and user; reversals linked both ways |
| Purchasing | Purchase orders (draft → open → partially/fully received, or cancelled); GRNs with received / accepted / rejected quantities; only accepted stock is booked; over-receipt blocked |
| Dispatch | Batch-level outward with strict stock validation — negative stock is impossible (enforced in the database too) |
| Adjustments | Request → review → post, with maker ≠ checker enforced; reasons DAMAGE, THEFT, EXPIRY, COUNTING_ERROR, OTHER |
| Reversals | Counter-entries that keep documents consistent (PO received quantities, document status) |
| Opening stock | Go-live balances per godown |
| Tally | Every posted document is queued; failures show a plain-language reason, back off and can be retried; a Tally outage never blocks stock operations |
| Security | Login with DB-backed sessions, role-based permissions (Admin, Store Manager, Warehouse Operator, Accounts, Management), audit log of every important action |

Deferred to later phases: invoice-linked partial dispatch, reorder alerts,
reports, audit-log UI, real Tally XML client, transfers and returns.

## Tech stack

Next.js 16 (App Router, React 19, Turbopack) · TypeScript · Prisma 5 · PostgreSQL 16 ·
Tailwind CSS 4 · Zod 4 · Vitest.

See [docs/architecture.md](docs/architecture.md) for the code layout and design rules.

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
```

Set `SEED_ADMIN_PASSWORD` in `.env`. For tests, create `.env.test` with
`DATABASE_URL` pointing at `margix_test` (tests refuse any other database).

### 3. Install, migrate, seed, run

```bash
npm install          # also runs prisma generate
npm run db:migrate   # apply migrations
npm run db:seed      # idempotent: roles, admin, demo data, opening stock
npm run dev          # http://localhost:3000
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
| `npm run db:migrate` | Create/apply migrations (development) |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:reset` | Drop, re-migrate and re-seed the development database |
| `npm run db:seed` | Seed (safe to repeat) |
| `npm run tally:sync` | One Tally sync pass — schedule it with cron/systemd |

## Environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_TTL_HOURS` | Idle session timeout (sliding; sessions also end after 7 days) |
| `TALLY_MODE` | `mock` (accepts vouchers), `fail` (simulates an outage) or `disabled` |
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
includes the spec §14 worked scenario, concurrency tests (parallel dispatches
and reversals, concurrent approvals, overlapping Tally runs), database guards
(append-only ledger, sign CHECK, reversal trigger), and the role and response
contract of the API.
