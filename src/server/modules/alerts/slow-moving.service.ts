import type { Tx } from "@/server/db/transaction";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { slowMovingMessage, type AlertLine } from "@/server/modules/notifications/notification-messages";
import { enqueueNotification } from "@/server/modules/notifications/notification-outbox.service";
import { notifiesImmediately } from "@/server/modules/notifications/notification-schedule";
import { getNotificationRule } from "@/server/modules/notifications/notification-settings.service";
import { listIdleStock, type StockAgingRow } from "@/server/modules/reports/reports.queries";
import { getStockAgingSettings } from "@/server/modules/settings/stock-aging";

export interface SlowMovingScanSummary {
  slowStockDays: number;
  /** SKU × godown pairs currently slow-moving. */
  active: number;
  raised: number;
  resolved: number;
  /** Deliveries queued for the newly identified items. */
  notificationsQueued: number;
}

/**
 * Daily slow-moving evaluation: every SKU × godown with stock on hand and no
 * movement for the configured number of days gets an ACTIVE SLOW_MOVING alert
 * (one per pair, updated on later scans); alerts whose stock has gone are
 * resolved (a movement resolves them straight away, see evaluateStockAlerts).
 * Newly identified items are notified in one summary when the rule is
 * "immediate"; otherwise they appear in the daily digest.
 */
export async function evaluateSlowMovingStock(tx: Tx): Promise<SlowMovingScanSummary> {
  const settings = await getStockAgingSettings(tx);
  const idle = await listIdleStock(settings.slowStockDays, { db: tx, limit: 100_000 });

  const upserted = idle.length
    ? await tx.$queryRaw<{ id: string; skuId: string; godownId: string; inserted: boolean }[]>`
        INSERT INTO "stock_alert"
          ("id", "sku_id", "godown_id", "alert_type", "current_qty", "threshold_qty", "status", "days_idle", "created_at", "updated_at")
        SELECT gen_random_uuid(), t."sku_id", t."godown_id", 'SLOW_MOVING', t."qty", 0, 'ACTIVE', t."days", now(), now()
        FROM unnest(${idle.map((r) => r.skuId)}::uuid[], ${idle.map((r) => r.godownId)}::uuid[],
                    ${idle.map((r) => r.quantity.toString())}::numeric[], ${idle.map((r) => r.daysIdle)}::int[])
             AS t("sku_id", "godown_id", "qty", "days")
        ON CONFLICT ("sku_id", "godown_id", "alert_type") WHERE "status" = 'ACTIVE'
        DO UPDATE SET "current_qty" = EXCLUDED."current_qty",
                      "days_idle" = EXCLUDED."days_idle",
                      "updated_at" = now()
        RETURNING "id", "sku_id" AS "skuId", "godown_id" AS "godownId", (xmax = 0) AS "inserted"`
    : [];

  const stillIdle = new Set(upserted.map((a) => a.id));
  const stale = await tx.stockAlert.findMany({
    where: { alertType: "SLOW_MOVING", status: "ACTIVE", id: { notIn: [...stillIdle] } },
    select: { id: true },
  });
  if (stale.length > 0) {
    await tx.stockAlert.updateMany({
      where: { id: { in: stale.map((a) => a.id) } },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
  }

  const byPair = new Map(idle.map((row) => [`${row.skuId}|${row.godownId}`, row]));
  const raised = upserted.filter((a) => a.inserted).map((a) => byPair.get(`${a.skuId}|${a.godownId}`)!);

  let notificationsQueued = 0;
  const rule = await getNotificationRule("SLOW_MOVING", tx);
  if (raised.length > 0 && notifiesImmediately(rule)) {
    notificationsQueued = await enqueueNotification(tx, rule, slowMovingMessage(raised.map(toAlertLine), settings.slowStockDays));
  }

  const summary: SlowMovingScanSummary = {
    slowStockDays: settings.slowStockDays,
    active: upserted.length,
    raised: raised.length,
    resolved: stale.length,
    notificationsQueued,
  };
  if (summary.raised > 0 || summary.resolved > 0) {
    await recordAudit(tx, null, { action: "SLOW_MOVING_SCAN_RUN", entityType: "StockAlert", newData: summary });
  }
  return summary;
}

export function toAlertLine(row: StockAgingRow): AlertLine {
  return {
    skuCode: row.skuCode,
    skuName: row.skuName,
    godownName: row.godownName,
    unit: row.unit,
    currentQty: row.quantity.toString(),
    daysIdle: row.daysIdle,
  };
}
