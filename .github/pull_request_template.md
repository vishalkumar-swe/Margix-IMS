## What and why

<!-- What does this change do, and why is it needed? Link the issue if there is one. -->

## How it was tested

<!-- Tests added/updated, manual checks (pages, roles, light/dark, phone width). -->

## Checklist

- [ ] `npm run lint`, `npm run typecheck` and `npm test` pass locally
- [ ] Schema changes come with a reviewed migration (`prisma migrate dev --create-only`)
- [ ] Stock is only changed through the ledger services (no direct writes to `stock_balance`)
- [ ] New API routes declare a permission; new pages call `requirePagePermission`
- [ ] Business actions are audited (`recordAudit`) inside the same transaction
- [ ] New settings are in `src/server/config/env.ts`, `.env.example` and the README
- [ ] Docs updated (`README.md`, `docs/`) where behaviour changed
