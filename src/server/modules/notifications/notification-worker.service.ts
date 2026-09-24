import type { NotificationAlertType } from "@prisma/client";
import { NOTIFICATION_ALERT_TYPES } from "@/lib/enums";
import { withTx, type Tx } from "@/server/db/transaction";
import { evaluateSlowMovingStock, type SlowMovingScanSummary } from "@/server/modules/alerts/slow-moving.service";
import { getStockAgingSettings } from "@/server/modules/settings/stock-aging";
import { logger } from "@/server/observability/logger";
import type { ChannelProviders } from "./channels";
import { deliverDueNotifications, type DeliverySummary } from "./notification-delivery.service";
import { digestMessage, type AlertLine } from "./notification-messages";
import { enqueueNotification } from "./notification-outbox.service";
import { istClock, isDailyJobDue, sendsDigest } from "./notification-schedule";
import { getNotificationRule } from "./notification-settings.service";

export const SLOW_MOVING_SCAN_JOB = "SLOW_MOVING_SCAN";
export const digestJobKey = (alertType: NotificationAlertType) => `DIGEST:${alertType}`;

export interface WorkerSummary {
  slowMovingScan: SlowMovingScanSummary | null;
  /** Alert types whose daily digest was queued in this pass. */
  digests: { alertType: NotificationAlertType; alerts: number; queued: number }[];
  delivery: DeliverySummary;
}

/**
 * One pass of the notify worker (scripts/notify.ts, run every minute or by
 * cron): the daily jobs that are due — the slow-moving scan first, then the
 * digests, so a digest includes the day's scan — followed by delivery of
 * everything queued in the outbox.
 */
export async function runNotificationWorker(
  options: { now?: Date; providers?: ChannelProviders; limit?: number } = {},
): Promise<WorkerSummary> {
  const now = options.now ?? new Date();
  const slowMovingScan = await runSlowMovingScanIfDue(now);
  const digests = await runDigestsIfDue(now);
  const delivery = await deliverDueNotifications({ providers: options.providers, limit: options.limit });
  return { slowMovingScan, digests, delivery };
}

/** Runs the slow-moving scan once per IST day, at or after the configured scan time. */
export async function runSlowMovingScanIfDue(now: Date): Promise<SlowMovingScanSummary | null> {
  const settings = await getStockAgingSettings();
  if (!isDailyJobDue(now, settings.scanTime, null)) return null;
  const summary = await withTx(
    async (tx) => ((await claimDailyRun(tx, SLOW_MOVING_SCAN_JOB, now)) ? evaluateSlowMovingStock(tx) : null),
    { timeoutMs: 120_000 },
  );
  if (summary) logger.info("slow-moving scan", { ...summary });
  return summary;
}

/** Queues each "daily digest" rule's summary of active alerts once per IST day, at its digest time. */
export async function runDigestsIfDue(now: Date): Promise<WorkerSummary["digests"]> {
  const queued: WorkerSummary["digests"] = [];
  for (const alertType of NOTIFICATION_ALERT_TYPES) {
    const rule = await getNotificationRule(alertType);
    if (!sendsDigest(rule) || !isDailyJobDue(now, rule.digestTime, null)) continue;

    const result = await withTx(async (tx) => {
      if (!(await claimDailyRun(tx, digestJobKey(alertType), now))) return null;
      const lines = await activeAlertLines(tx, alertType);
      if (lines.length === 0) return { alertType, alerts: 0, queued: 0 };
      const count = await enqueueNotification(tx, rule, digestMessage(alertType, lines, istClock(now).day));
      return { alertType, alerts: lines.length, queued: count };
    });
    if (result) queued.push(result);
  }
  if (queued.length > 0) logger.info("notification digests", { digests: queued });
  return queued;
}

/**
 * Claims today's run of a once-a-day job. The conditional upsert takes a row
 * lock, so of two concurrent workers exactly one gets `true`; the claim is
 * part of the caller's transaction and is undone if the job fails.
 */
export async function claimDailyRun(tx: Tx, key: string, now: Date): Promise<boolean> {
  const day = istClock(now).day;
  const rows = await tx.$queryRaw<{ key: string }[]>`
    INSERT INTO "scheduled_job_run" ("key", "last_run_on", "last_run_at")
    VALUES (${key}, ${day}::date, now())
    ON CONFLICT ("key") DO UPDATE
      SET "last_run_on" = EXCLUDED."last_run_on", "last_run_at" = now()
      WHERE "scheduled_job_run"."last_run_on" < EXCLUDED."last_run_on"
    RETURNING "key"`;
  return rows.length > 0;
}

async function activeAlertLines(tx: Tx, alertType: NotificationAlertType): Promise<AlertLine[]> {
  const alerts = await tx.stockAlert.findMany({
    where: { alertType, status: "ACTIVE" },
    orderBy: alertType === "SLOW_MOVING" ? [{ daysIdle: "desc" }] : [{ createdAt: "asc" }],
    select: {
      currentQty: true,
      thresholdQty: true,
      daysIdle: true,
      sku: { select: { code: true, name: true, baseUom: { select: { code: true } } } },
      godown: { select: { name: true } },
    },
  });
  return alerts.map((a) => ({
    skuCode: a.sku.code,
    skuName: a.sku.name,
    godownName: a.godown.name,
    unit: a.sku.baseUom.code,
    currentQty: a.currentQty.toString(),
    thresholdQty: a.thresholdQty.toString(),
    daysIdle: a.daysIdle,
  }));
}
