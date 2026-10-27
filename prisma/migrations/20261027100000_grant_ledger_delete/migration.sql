-- Grant DELETE on inventory_ledger to margix_app if the role exists.
-- The append-only trigger margix_forbid_ledger_mutation continues to enforce
-- that only DEMO-* rows can ever be deleted, and only during an explicit
-- transaction with margix.sandbox_purge = 'on'.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'margix_app') THEN
    GRANT DELETE ON "inventory_ledger" TO margix_app;
  END IF;
END $$;
