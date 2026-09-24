import { randomUUID } from "node:crypto";
import type { Godown, Sku } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { toDecimal } from "@/server/db/decimal";
import { withTx } from "@/server/db/transaction";
import { saveReorderRule } from "@/server/modules/alerts/alerts.service";
import { evaluateSlowMovingStock } from "@/server/modules/alerts/slow-moving.service";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import { saveNotificationRule } from "@/server/modules/notifications/notification-settings.service";
import { runSlowMovingScanIfDue } from "@/server/modules/notifications/notification-worker.service";
import { getStockAging } from "@/server/modules/reports/reports.queries";
import { getStockAgingSettings, saveStockAgingSettings } from "@/server/modules/settings/stock-aging";
import { createSku } from "../../helpers/factories";
import { stockedScenario, type StockedScenario } from "../../helpers/scenario";

let s: StockedScenario;
const DAY = 24 * 60 * 60 * 1000;

/** Stock of a new SKU whose only movement happened `daysAgo` days ago. */
async function idleStock(godown: Godown, daysAgo: number, quantity = "7"): Promise<{ sku: Sku; batchId: string }> {
  const sku = await createSku();
  const batch = await prisma.batch.create({ data: { skuId: sku.id, batchNumber: "OLD-1" } });
  await prisma.inventoryLedger.create({
    data: {
      skuId: sku.id,
      godownId: godown.id,
      batchId: batch.id,
      movementType: "OPENING",
      quantity: toDecimal(quantity),
      balanceAfter: toDecimal(quantity),
      referenceType: "OPENING_BALANCE",
      referenceId: randomUUID(),
      referenceNo: "LEGACY",
      createdById: s.admin.userId,
      createdAt: new Date(Date.now() - daysAgo * DAY),
    },
  });
  await prisma.stockBalance.create({ data: { skuId: sku.id, godownId: godown.id, batchId: batch.id, quantity: toDecimal(quantity) } });
  return { sku, batchId: batch.id };
}

const scan = () => withTx((tx) => evaluateSlowMovingStock(tx));
const slowAlerts = () => prisma.stockAlert.findMany({ where: { alertType: "SLOW_MOVING" }, orderBy: { createdAt: "asc" } });

beforeEach(async () => {
  s = await stockedScenario("100");
});

describe("slow / dead stock settings", () => {
  it("default to the environment values and can be changed by administrators (audited)", async () => {
    expect(await getStockAgingSettings()).toEqual({ slowStockDays: 30, deadStockDays: 90, scanTime: "08:00" });
    await idleStock(s.godown, 20);
    expect((await getStockAging({ kind: "slow", format: "json" })).rows).toHaveLength(0);

    await saveStockAgingSettings(s.admin, { slowStockDays: 15, deadStockDays: 60, scanTime: "07:30" });

    const report = await getStockAging({ kind: "slow", format: "json" });
    expect(report.minDays).toBe(15);
    expect(report.rows).toHaveLength(1);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "SETTINGS_UPDATED" } });
    expect(audit).toMatchObject({ entityId: "stock-aging", oldData: { slowStockDays: 30 }, newData: { slowStockDays: 15 } });
  });
});

describe("slow-moving evaluation", () => {
  it("raises one alert per idle SKU × godown and keeps it up to date", async () => {
    const { sku } = await idleStock(s.godown, 45);
    await idleStock(s.godown, 10); // not slow yet

    expect(await scan()).toMatchObject({ slowStockDays: 30, active: 1, raised: 1, resolved: 0 });
    const [alert] = await slowAlerts();
    expect(alert).toMatchObject({ skuId: sku.id, status: "ACTIVE", daysIdle: 45 });
    expect(alert.currentQty.toString()).toBe("7");

    // A second scan updates, never duplicates.
    expect(await scan()).toMatchObject({ active: 1, raised: 0 });
    expect(await slowAlerts()).toHaveLength(1);
  });

  it("resolves the alert as soon as the item moves", async () => {
    const { sku, batchId } = await idleStock(s.godown, 45);
    await scan();
    await postDispatch(s.operator, { godownId: s.godown.id, items: [{ skuId: sku.id, batchId, quantity: "2" }] });
    const [alert] = await slowAlerts();
    expect(alert.status).toBe("RESOLVED");
    expect(await scan()).toMatchObject({ active: 0, raised: 0, resolved: 0 });
  });

  it("resolves alerts the scan no longer finds (threshold raised)", async () => {
    await idleStock(s.godown, 45);
    await scan();
    await saveStockAgingSettings(s.admin, { slowStockDays: 60, deadStockDays: 90, scanTime: "08:00" });
    expect(await scan()).toMatchObject({ active: 0, resolved: 1 });
  });

  it("notifies newly identified items in one summary when the rule is immediate", async () => {
    await saveNotificationRule(s.admin, "SLOW_MOVING", {
      isEnabled: true,
      frequency: "IMMEDIATE",
      digestTime: "09:00",
      inAppEnabled: true,
      emailEnabled: true,
      whatsappEnabled: false,
      inAppRoles: ["ADMIN"],
      inAppUserIds: [],
      emailRecipients: ["stores@example.com"],
      whatsappRecipients: [],
    });
    const a = await idleStock(s.godown, 45);
    const b = await idleStock(s.godown, 50);

    expect(await scan()).toMatchObject({ raised: 2, notificationsQueued: 2 });
    const rows = await prisma.notificationOutbox.findMany();
    expect(rows.map((r) => r.channel).sort()).toEqual(["EMAIL", "IN_APP"]);
    expect(rows[0].subject).toBe("Slow-Moving Stock: 2 products with no movement for 30+ days");
    expect(rows[0].body).toContain(a.sku.code);
    expect(rows[0].body).toContain(b.sku.code);

    // Already known items are not announced again.
    await scan();
    expect(await prisma.notificationOutbox.count()).toBe(2);
  });

  it("leaves notification to the digest by default and audits the scan", async () => {
    await idleStock(s.godown, 45);
    expect(await scan()).toMatchObject({ raised: 1, notificationsQueued: 0 });
    expect(await prisma.auditLog.count({ where: { action: "SLOW_MOVING_SCAN_RUN" } })).toBe(1);
  });

  it("runs from the worker once per IST day, after the scan time", async () => {
    await idleStock(s.godown, 45);
    // 07:59 IST: before the default 08:00 scan.
    expect(await runSlowMovingScanIfDue(new Date("2026-09-24T02:29:00Z"))).toBeNull();
    expect(await runSlowMovingScanIfDue(new Date("2026-09-24T02:30:00Z"))).toMatchObject({ raised: 1 });
    expect(await runSlowMovingScanIfDue(new Date("2026-09-24T10:00:00Z"))).toBeNull();
    expect(await runSlowMovingScanIfDue(new Date("2026-09-25T03:00:00Z"))).toMatchObject({ active: 1, raised: 0 });
  });

  it("keeps low-stock and slow-moving alerts apart on the same SKU", async () => {
    const { sku } = await idleStock(s.godown, 45, "3");
    await scan();
    const rule = { skuId: sku.id, godownId: s.godown.id, reorderLevel: "5" };
    await saveReorderRule(s.manager, { ...rule, isActive: true });
    const active = async () =>
      (await prisma.stockAlert.findMany({ where: { skuId: sku.id, status: "ACTIVE" }, orderBy: { alertType: "asc" } })).map((a) => a.alertType);
    expect(await active()).toEqual(["LOW_STOCK", "SLOW_MOVING"]);

    // Switching the reorder rule off clears only the low-stock alert.
    await saveReorderRule(s.manager, { ...rule, isActive: false });
    expect(await active()).toEqual(["SLOW_MOVING"]);
  });
});
