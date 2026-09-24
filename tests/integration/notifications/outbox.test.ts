import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { toDecimal } from "@/server/db/decimal";
import { withTx } from "@/server/db/transaction";
import { saveReorderRule } from "@/server/modules/alerts/alerts.service";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import { postMovements } from "@/server/modules/inventory/ledger.service";
import { saveNotificationRule } from "@/server/modules/notifications/notification-settings.service";
import type { NotificationRuleInput } from "@/lib/validation/notifications";
import { createUser } from "../../helpers/factories";
import { stockedScenario, type StockedScenario } from "../../helpers/scenario";

let s: StockedScenario;

const rule = (overrides: Partial<NotificationRuleInput> = {}): NotificationRuleInput => ({
  isEnabled: true,
  frequency: "IMMEDIATE",
  digestTime: "09:00",
  inAppEnabled: true,
  emailEnabled: true,
  whatsappEnabled: true,
  inAppRoles: ["ADMIN", "STORE_MANAGER"],
  inAppUserIds: [],
  emailRecipients: ["purchase@example.com"],
  whatsappRecipients: ["919876543210"],
  ...overrides,
});

const dispatch = (quantity: string) =>
  postDispatch(s.operator, { godownId: s.godown.id, items: [{ skuId: s.sku.id, batchId: s.batch.id, quantity }] });

const outbox = () => prisma.notificationOutbox.findMany({ orderBy: [{ channel: "asc" }, { recipient: "asc" }] });

beforeEach(async () => {
  s = await stockedScenario("100");
  await saveReorderRule(s.manager, { skuId: s.sku.id, godownId: s.godown.id, reorderLevel: "20", isActive: true });
});

describe("low-stock notifications (transactional outbox)", () => {
  it("queues one message per channel and recipient when the alert is raised", async () => {
    await saveNotificationRule(s.admin, "LOW_STOCK", rule());
    await dispatch("92");

    const alert = await prisma.stockAlert.findFirstOrThrow({ where: { status: "ACTIVE" } });
    const rows = await outbox();
    // In-app: the admin and the manager (not the operator); plus one e-mail and one WhatsApp.
    expect(rows.map((r) => r.channel)).toEqual(["IN_APP", "IN_APP", "EMAIL", "WHATSAPP"]);
    expect(rows.filter((r) => r.channel === "IN_APP").map((r) => r.recipient).sort()).toEqual(
      [s.admin.userId, s.manager.userId].sort(),
    );
    for (const row of rows) {
      expect(row).toMatchObject({ status: "PENDING", alertType: "LOW_STOCK", stockAlertId: alert.id, link: "/alerts" });
      expect(row.body).toBe(
        `Low Stock Alert: Product ${s.sku.name} (${s.sku.code}) at ${s.godown.name}, Current Stock: 8 KG, ` +
          "Minimum Required: 20 KG, Action Required: Reorder stock.",
      );
    }
    expect(rows.find((r) => r.channel === "WHATSAPP")?.payload).toEqual({
      whatsapp: { template: "LOW_STOCK", params: [`${s.sku.name} (${s.sku.code}) at ${s.godown.name}`, "8 KG", "20 KG"] },
    });
  });

  it("notifies on raise only, not on every posting while the alert stays active", async () => {
    await saveNotificationRule(s.admin, "LOW_STOCK", rule({ emailEnabled: false, whatsappEnabled: false, inAppRoles: ["ADMIN"] }));
    await dispatch("85");
    await dispatch("5");
    await dispatch("5");
    expect(await prisma.notificationOutbox.count()).toBe(1);
  });

  it("raises when stock reaches the minimum exactly", async () => {
    await dispatch("80");
    expect(await prisma.stockAlert.count({ where: { status: "ACTIVE" } })).toBe(1);
  });

  it("uses the defaults (in-app to admins and store managers) until configured", async () => {
    await dispatch("90");
    const rows = await outbox();
    expect(rows.map((r) => r.channel)).toEqual(["IN_APP", "IN_APP"]);
  });

  it("writes nothing when the change rolls back", async () => {
    await saveNotificationRule(s.admin, "LOW_STOCK", rule());
    await expect(
      withTx(async (tx) => {
        await postMovements(tx, s.operator, [
          {
            key: { skuId: s.sku.id, godownId: s.godown.id, batchId: s.batch.id },
            movementType: "OUTWARD",
            quantity: toDecimal("-95"),
            reference: { type: "DISPATCH", id: s.sku.id, no: "TEST-ROLLBACK" },
          },
        ]);
        expect(await tx.notificationOutbox.count()).toBe(4);
        throw new Error("simulated failure after posting");
      }),
    ).rejects.toThrow("simulated failure");

    expect(await prisma.stockAlert.count()).toBe(0);
    expect(await prisma.notificationOutbox.count()).toBe(0);
  });

  it("queues nothing when the alert type is disabled", async () => {
    await saveNotificationRule(s.admin, "LOW_STOCK", rule({ isEnabled: false }));
    await dispatch("90");
    expect(await prisma.stockAlert.count({ where: { status: "ACTIVE" } })).toBe(1);
    expect(await prisma.notificationOutbox.count()).toBe(0);
  });

  it("leaves daily-digest alerts for the digest", async () => {
    await saveNotificationRule(s.admin, "LOW_STOCK", rule({ frequency: "DAILY_DIGEST" }));
    await dispatch("90");
    expect(await prisma.stockAlert.count({ where: { status: "ACTIVE" } })).toBe(1);
    expect(await prisma.notificationOutbox.count()).toBe(0);
  });

  it("addresses in-app users picked by name and skips inactive users", async () => {
    const accounts = await createUser("ACCOUNTS");
    await createUser("STORE_MANAGER", { isActive: false });
    await saveNotificationRule(
      s.admin,
      "LOW_STOCK",
      rule({ emailEnabled: false, whatsappEnabled: false, inAppRoles: ["STORE_MANAGER"], inAppUserIds: [accounts.id] }),
    );
    await dispatch("90");
    const recipients = (await outbox()).map((r) => r.recipient).sort();
    expect(recipients).toEqual([accounts.id, s.manager.userId].sort());
  });
});

describe("notification rule settings", () => {
  it("are audited with old and new values", async () => {
    await saveNotificationRule(s.admin, "LOW_STOCK", rule());
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "NOTIFICATION_RULE_SAVED" } });
    expect(audit).toMatchObject({ entityType: "NotificationRule", entityId: "LOW_STOCK", userId: s.admin.userId });
    expect(audit.oldData).toMatchObject({ customised: false, emailEnabled: false });
    expect(audit.newData).toMatchObject({ customised: true, emailRecipients: ["purchase@example.com"] });
  });

  it("reject unknown in-app users", async () => {
    await expect(
      saveNotificationRule(s.admin, "LOW_STOCK", rule({ inAppUserIds: ["00000000-0000-4000-8000-000000000000"] })),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
