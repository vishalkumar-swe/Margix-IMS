-- Least-privilege access for the application login `margix_app` (spec §12.1).
--
-- The schema owner (used only for migrations, via DIRECT_DATABASE_URL) keeps
-- full rights. The app connects as margix_app, which can read and write rows
-- but can never TRUNCATE a table or UPDATE/DELETE posted ledger and audit
-- records — even if the application itself were compromised. The append-only
-- triggers already reject row updates/deletes; privileges are a second,
-- independent layer that also covers TRUNCATE, which row triggers do not.
--
-- One-time, as a superuser/DBA:   CREATE ROLE margix_app LOGIN PASSWORD '…';
-- After every migrate/reset:      npm run db:grants   (idempotent)
--
-- Written as a single DO block so it runs through any SQL client or driver.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'margix_app') THEN
    RAISE NOTICE 'Role margix_app does not exist; skipping grants.';
    RETURN;
  END IF;

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO margix_app', current_database());
  GRANT USAGE ON SCHEMA public TO margix_app;

  -- Row access to every application table and sequence.
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO margix_app;
  GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO margix_app;
  REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM margix_app;

  -- Migration history is none of the app's business.
  REVOKE ALL ON "_prisma_migrations" FROM margix_app;

  -- Append-only tables. SELECT … FOR UPDATE (used to serialise reversals)
  -- needs UPDATE on at least one column, so only "id" is granted; the
  -- append-only trigger still rejects any actual update.
  REVOKE UPDATE, DELETE ON "inventory_ledger", "audit_log" FROM margix_app;
  GRANT UPDATE ("id") ON "inventory_ledger" TO margix_app;

  -- Tables created by future migrations get row access automatically.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO margix_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO margix_app;
END
$$;
