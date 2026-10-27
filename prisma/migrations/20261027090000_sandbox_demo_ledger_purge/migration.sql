-- The inventory ledger stays append-only for production data. The sandbox,
-- however, must be removable: its demo SKU is deliberately isolated behind the
-- reserved `DEMO-` prefix. Allow deletes only for that SKU while an explicit
-- transaction-local flag is set by the admin-only sandbox purge.
CREATE OR REPLACE FUNCTION margix_forbid_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('margix.sandbox_purge', true) = 'on'
     AND EXISTS (
       SELECT 1 FROM "sku"
       WHERE "id" = OLD."sku_id" AND "code" LIKE 'DEMO-%'
     )
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END
$$;

DROP TRIGGER "inventory_ledger_append_only" ON "inventory_ledger";
CREATE TRIGGER "inventory_ledger_append_only"
  BEFORE UPDATE OR DELETE ON "inventory_ledger"
  FOR EACH ROW EXECUTE FUNCTION margix_forbid_ledger_mutation();
