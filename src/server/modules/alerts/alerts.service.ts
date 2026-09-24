import { randomUUID } from "node:crypto";
import type { ReorderRule } from "@prisma/client";
import type { ReorderRuleInput } from "@/lib/validation/alerts";
import type { Actor } from "@/server/actor";
import { ZERO, type Decimal } from "@/server/db/decimal";
import { withTx, type Tx } from "@/server/db/transaction";
import { ValidationError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { lowStockMessage } from "@/server/modules/notifications/notification-messages";
import { enqueueNotification } from "@/server/modules/notifications/notification-outbox.service";
import { notifiesImmediately } from "@/server/modules/notifications/notification-schedule";
import { getNotificationRule } from "@/server/modules/notifications/notification-settings.service";

export interface SkuGodown {
  skuId: string;
  godownId: string;
}

/**
 * Re-evaluates stock alerts for the given SKU × godown pairs (spec §6.5).
 * Called by the inventory engine in the same transaction as every stock
 * change, so an alert can never disagree with the stock it describes.
 *
 * LOW_STOCK: raised when godown stock reaches or falls below the reorder
 * level. Duplicates are impossible: a partial unique index allows one ACTIVE
 * alert per SKU × godown × type; while the condition persists the existing
 * alert is updated, and it is resolved when stock recovers. Only a newly
 * raised alert is notified, and the notification is queued in this same
 * transaction (transactional outbox).
 *
 * SLOW_MOVING: any movement resolves the pair's slow-moving alert.
 */
export async function evaluateStockAlerts(tx: Tx, pairs: SkuGodown[]): Promise<void> {
  const unique = [...new Map(pairs.map((p) => [`${p.skuId}|${p.godownId}`, p])).values()];
  if (unique.length === 0) return;

  await tx.stockAlert.updateMany({
    where: {
      alertType: "SLOW_MOVING",
      status: "ACTIVE",
      OR: unique.map(({ skuId, godownId }) => ({ skuId, godownId })),
    },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });

  for (const { skuId, godownId } of unique) {
    const rule = await tx.reorderRule.findUnique({ where: { skuId_godownId: { skuId, godownId } } });
    if (!rule?.isActive) continue;
    await applyRule(tx, rule, await godownStock(tx, skuId, godownId));
  }
}

/** Creates or updates a reorder rule and re-evaluates its alert immediately. */
export function saveReorderRule(actor: Actor, input: ReorderRuleInput): Promise<ReorderRule> {
  return withTx(async (tx) => {
    const sku = await tx.sku.findUnique({ where: { id: input.skuId }, select: { status: true } });
    const godown = await tx.godown.findUnique({ where: { id: input.godownId }, select: { id: true } });
    if (!sku || !godown) throw new ValidationError("Unknown SKU or godown.");

    const rule = await tx.reorderRule.upsert({
      where: { skuId_godownId: { skuId: input.skuId, godownId: input.godownId } },
      update: { reorderLevel: input.reorderLevel, isActive: input.isActive },
      create: {
        skuId: input.skuId,
        godownId: input.godownId,
        reorderLevel: input.reorderLevel,
        isActive: input.isActive,
      },
    });

    if (rule.isActive) {
      await applyRule(tx, rule, await godownStock(tx, rule.skuId, rule.godownId));
    } else {
      await resolveActiveAlert(tx, rule.skuId, rule.godownId, null);
    }
    await recordAudit(tx, actor, {
      action: "REORDER_RULE_SAVED",
      entityType: "ReorderRule",
      entityId: rule.id,
      newData: rule,
    });
    return rule;
  });
}

async function applyRule(tx: Tx, rule: ReorderRule, quantity: Decimal): Promise<void> {
  if (quantity.lessThanOrEqualTo(rule.reorderLevel)) {
    // xmax = 0 only for a freshly inserted row: tells a new alert from an update.
    const [alert] = await tx.$queryRaw<{ id: string; inserted: boolean }[]>`
      INSERT INTO "stock_alert"
        ("id", "sku_id", "godown_id", "alert_type", "current_qty", "threshold_qty", "status", "created_at", "updated_at")
      VALUES (${randomUUID()}::uuid, ${rule.skuId}::uuid, ${rule.godownId}::uuid, 'LOW_STOCK',
              ${quantity.toString()}::numeric, ${rule.reorderLevel.toString()}::numeric, 'ACTIVE', now(), now())
      ON CONFLICT ("sku_id", "godown_id", "alert_type") WHERE "status" = 'ACTIVE'
      DO UPDATE SET "current_qty" = EXCLUDED."current_qty",
                    "threshold_qty" = EXCLUDED."threshold_qty",
                    "updated_at" = now()
      RETURNING "id", (xmax = 0) AS "inserted"`;
    if (alert.inserted) await notifyLowStock(tx, alert.id, rule, quantity);
  } else {
    await resolveActiveAlert(tx, rule.skuId, rule.godownId, quantity);
  }
}

/** Queues the immediate low-stock notification (daily-digest rules wait for the digest). */
async function notifyLowStock(tx: Tx, alertId: string, rule: ReorderRule, quantity: Decimal): Promise<void> {
  const settings = await getNotificationRule("LOW_STOCK", tx);
  if (!notifiesImmediately(settings)) return;
  const [sku, godown] = await Promise.all([
    tx.sku.findUniqueOrThrow({ where: { id: rule.skuId }, select: { code: true, name: true, baseUom: { select: { code: true } } } }),
    tx.godown.findUniqueOrThrow({ where: { id: rule.godownId }, select: { name: true } }),
  ]);
  const message = lowStockMessage({
    skuCode: sku.code,
    skuName: sku.name,
    godownName: godown.name,
    unit: sku.baseUom.code,
    currentQty: quantity.toString(),
    thresholdQty: rule.reorderLevel.toString(),
  });
  await enqueueNotification(tx, settings, message, { stockAlertId: alertId });
}

async function resolveActiveAlert(tx: Tx, skuId: string, godownId: string, quantity: Decimal | null): Promise<void> {
  await tx.stockAlert.updateMany({
    where: { skuId, godownId, alertType: "LOW_STOCK", status: "ACTIVE" },
    data: { status: "RESOLVED", resolvedAt: new Date(), ...(quantity ? { currentQty: quantity } : {}) },
  });
}

async function godownStock(tx: Tx, skuId: string, godownId: string): Promise<Decimal> {
  const result = await tx.stockBalance.aggregate({ where: { skuId, godownId }, _sum: { quantity: true } });
  return result._sum.quantity ?? ZERO;
}
