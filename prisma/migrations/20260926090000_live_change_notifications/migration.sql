-- Live updates: announce committed changes on the "margix_changes" channel.
--
-- Every business mutation writes an audit_log row inside its transaction, so a
-- trigger there covers all of them without touching the services. NOTIFY is
-- delivered only when the transaction commits (and dropped on rollback), so
-- listeners never hear about changes that did not happen. The payload carries
-- no data — only what changed — and clients re-read through normal,
-- permission-checked requests.
--
-- Sign-in activity is not a data change and is left out. Tally sync results are
-- written by the worker without an audit entry, so job status changes notify
-- separately.

CREATE FUNCTION "notify_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'audit_log' THEN
    PERFORM pg_notify('margix_changes', json_build_object('entity', NEW."entity_type", 'action', NEW."action")::text);
  ELSE
    PERFORM pg_notify('margix_changes', json_build_object('entity', 'TallySyncJob', 'action', 'TALLY_JOB_' || NEW."status")::text);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "audit_log_notify_change"
AFTER INSERT ON "audit_log"
FOR EACH ROW
WHEN (NEW."action" NOT LIKE 'AUTH\_%')
EXECUTE FUNCTION "notify_change"();

CREATE TRIGGER "tally_sync_job_notify_change"
AFTER UPDATE OF "status" ON "tally_sync_job"
FOR EACH ROW
WHEN (OLD."status" IS DISTINCT FROM NEW."status")
EXECUTE FUNCTION "notify_change"();
