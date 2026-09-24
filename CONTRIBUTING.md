# Contributing to Margix IMS

This guide covers how changes get from a branch to production. For setup, see
the [README](README.md). The code layout is described in
[docs/architecture.md](docs/architecture.md), and integrations in
[docs/integrations.md](docs/integrations.md).

## Workflow

1. Branch from `main`: `feat/<topic>`, `fix/<topic>` or `chore/<topic>`.
2. Keep each change focused. Put schema changes, business logic and UI for one feature in the same PR.
3. Open a pull request into `main` and fill in the template.
4. CI must pass before merging. It runs:
   - lint and typecheck;
   - a check that migrations match the schema;
   - unit and integration tests against Postgres;
   - the production build and worker bundle;
   - the Playwright end-to-end tests;
   - a dependency audit and dependency review;
   - both container image builds;
   - CodeQL.
5. Squash-merge. `main` is always deployable.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(scope): …`,
`fix(scope): …`, `docs: …`, `chore: …`, `refactor: …`, `test: …`. The scope is
the module, e.g. `feat(webhooks): …` or `fix(dispatch): …`. The body explains *why*.

## Before you push

```bash
npm run lint
npm run typecheck
npm test               # needs the local Postgres (npm run db:up)
npm run build          # when you touched config, routes or server code
npm run test:e2e       # when you touched a user flow (after npm run build)
```

## Rules the code relies on

- **Stock changes only through the ledger services** (`src/server/modules/inventory`).
  The ledger and audit tables are append-only. Corrections are reversals, never edits.
- **One transaction per business action**. It covers the document, ledger lines,
  stock balance, audit record, and any outbox rows (Tally, notifications, webhooks).
- **Every API route declares a permission** (`apiRoute({ permission })`). Every
  page calls `requirePagePermission`. The matrix is in `src/lib/permissions.ts`.
- **Migrations** are created with `npx prisma migrate dev --create-only --name <name>`,
  reviewed, and committed with the schema change. Add CHECK constraints and
  triggers for invariants the database can enforce.
- **Settings** live in `src/server/config/env.ts` (validated). Add new ones to
  `.env.example` and the README as well. Never commit secrets. `deploy/.env.production` is git-ignored.
- **Tests**: integration tests for anything that touches the database, and unit
  tests for pure logic. Name tests after the behaviour, not the function.
- **UI**: use the components in `src/components/ui`. Style through the theme
  tokens so both themes work. Dialogs and menus use `surface-solid`. Check at phone width.

## Deploying

After merging to `main`, deploy from the production checkout on the server:

```bash
deploy/deploy.sh
```

It builds, runs migrations, and swaps the release in without downtime (about a
minute). If the build or the migrations fail, nothing is swapped. See
[deploy/RUNBOOK.md](deploy/RUNBOOK.md).
