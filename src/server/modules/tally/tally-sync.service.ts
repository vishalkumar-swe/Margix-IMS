import type { TallyEntityType, TallySyncJob } from "@prisma/client";
import type { Actor } from "@/server/actor";
import { getEnv } from "@/server/config/env";
import { prisma } from "@/server/db/client";
import { withTx } from "@/server/db/transaction";
import { ConflictError, NotFoundError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { logger } from "@/server/observability/logger";
import { createTallyClient, type TallyClient, type TallyPushResult } from "./tally-client";
import { buildTallyVoucher, TallyMappingError } from "./tally-voucher";

/** After this many automatic attempts a job waits for a manual retry. */
export const MAX_AUTO_ATTEMPTS = 8;
const CLAIM_LEASE = "2 minutes";

export interface TallySyncSummary {
  enabled: boolean;
  processed: number;
  synced: number;
  failed: number;
}

interface ClaimedJob {
  id: string;
  entity_type: TallyEntityType;
  entity_id: string;
  entity_no: string;
  attempts: number;
}

/**
 * Processes due sync jobs (spec §7). Jobs are claimed with
 * FOR UPDATE SKIP LOCKED, so concurrent runs never push the same job twice;
 * failed jobs back off exponentially so they never block newer ones. Calls to
 * Tally happen outside any database transaction — a Tally outage can never
 * block or roll back an inventory transaction.
 */
export async function runTallySync(options: { client?: TallyClient | null; limit?: number } = {}): Promise<TallySyncSummary> {
  const client = options.client !== undefined ? options.client : createTallyClient(getEnv());
  if (!client) return { enabled: false, processed: 0, synced: 0, failed: 0 };

  const jobs = await claimDueJobs(options.limit ?? 20);
  const summary: TallySyncSummary = { enabled: true, processed: jobs.length, synced: 0, failed: 0 };

  for (const job of jobs) {
    const startedAt = Date.now();
    const result = await pushJob(client, job);
    await recordAttempt(job, result, Date.now() - startedAt);
    if (result.ok) {
      summary.synced++;
    } else {
      summary.failed++;
      logger.warn("tally sync failed", { jobId: job.id, entityNo: job.entity_no, attempt: job.attempts, error: result.error });
    }
  }
  if (summary.processed > 0) logger.info("tally sync run", { ...summary });
  return summary;
}

/** Re-queues a FAILED job immediately with a fresh attempt budget. */
export async function retryTallyJob(actor: Actor, id: string): Promise<TallySyncJob> {
  return withTx(async (tx) => {
    const { count } = await tx.tallySyncJob.updateMany({
      where: { id, status: "FAILED" },
      data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date() },
    });
    if (count === 0) {
      const job = await tx.tallySyncJob.findUnique({ where: { id }, select: { status: true } });
      if (!job) throw new NotFoundError("Tally sync job", id);
      throw new ConflictError("INVALID_STATE", `Only failed jobs can be retried (this job is ${job.status}).`);
    }
    await recordAudit(tx, actor, { action: "TALLY_JOB_RETRIED", entityType: "TallySyncJob", entityId: id });
    return tx.tallySyncJob.findUniqueOrThrow({ where: { id } });
  });
}

async function claimDueJobs(limit: number): Promise<ClaimedJob[]> {
  return prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "tally_sync_job"
    SET "status" = 'IN_PROGRESS',
        "locked_until" = now() + ${CLAIM_LEASE}::interval,
        "attempts" = "attempts" + 1,
        "updated_at" = now()
    WHERE "id" IN (
      SELECT "id" FROM "tally_sync_job"
      WHERE ("status" IN ('PENDING', 'FAILED') AND "next_attempt_at" <= now() AND "attempts" < ${MAX_AUTO_ATTEMPTS})
         OR ("status" = 'IN_PROGRESS' AND "locked_until" < now())
      ORDER BY "created_at"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "entity_type", "entity_id", "entity_no", "attempts"`;
}

async function pushJob(client: TallyClient, job: ClaimedJob): Promise<TallyPushResult> {
  try {
    const voucher = await buildTallyVoucher({
      entityType: job.entity_type,
      entityId: job.entity_id,
      entityNo: job.entity_no,
    });
    return await client.push(voucher);
  } catch (error) {
    if (error instanceof TallyMappingError) return { ok: false, error: error.message };
    logger.error("tally voucher preparation failed", { jobId: job.id, entityNo: job.entity_no, err: error });
    return { ok: false, error: "Unexpected error while preparing the Tally voucher." };
  }
}

async function recordAttempt(job: ClaimedJob, result: TallyPushResult, durationMs: number): Promise<void> {
  const backoffMinutes = Math.min(2 ** job.attempts, 60);
  await prisma.$transaction([
    prisma.tallySyncJob.update({
      where: { id: job.id },
      data: result.ok
        ? { status: "SYNCED", syncedAt: new Date(), tallyVoucherId: result.voucherId, lastError: null, lockedUntil: null }
        : {
            status: "FAILED",
            lastError: result.error,
            lockedUntil: null,
            nextAttemptAt: new Date(Date.now() + backoffMinutes * 60_000),
          },
    }),
    prisma.tallySyncLog.create({
      data: {
        jobId: job.id,
        attemptNo: job.attempts,
        status: result.ok ? "SYNCED" : "FAILED",
        error: result.ok ? null : result.error,
        durationMs,
      },
    }),
  ]);
}
