import { beforeEach, describe, expect, it } from "vitest";
import type { NotificationRuleInput } from "@/lib/validation/notifications";
import { prisma } from "@/server/db/client";
import { saveReorderRule } from "@/server/modules/alerts/alerts.service";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import { deliverDueNotifications, retryDelivery } from "@/server/modules/notifications/notification-delivery.service";
import { MAX_DELIVERY_ATTEMPTS } from "@/server/modules/notifications/notification-schedule";
import { saveNotificationRule } from "@/server/modules/notifications/notification-settings.service";
import { sendTestNotification } from "@/server/modules/notifications/notification-test.service";
import { runDigestsIfDue, runNotificationWorker } from "@/server/modules/notifications/notification-worker.service";
import { createChannelProviders } from "@/server/modules/notifications/channels";
import { getEnv } from "@/server/config/env";
import { FakeChannel, fakeProviders } from "../../helpers/notifications";
import { stockedScenario, type StockedScenario } from "../../helpers/scenario";

let s: StockedScenario;

const rule = (overrides: Partial<NotificationRuleInput> = {}): NotificationRuleInput => ({
  isEnabled: true,
  frequency: "IMMEDIATE",
  digestTime: "09:00",
  inAppEnabled: true,
  emailEnabled: true,
  whatsappEnabled: false,
  inAppRoles: ["ADMIN"],
  inAppUserIds: [],
  emailRecipients: ["purchase@example.com"],
  whatsappRecipients: [],
  ...overrides,
});

/** 2026-09-24 09:30 IST. */
const MORNING = new Date("2026-09-24T04:00:00Z");

async function raiseLowStock() {
  await saveReorderRule(s.manager, { skuId: s.sku.id, godownId: s.godown.id, reorderLevel: "20", isActive: true });
  await postDispatch(s.operator, { godownId: s.godown.id, items: [{ skuId: s.sku.id, batchId: s.batch.id, quantity: "90" }] });
}

beforeEach(async () => {
  s = await stockedScenario("100");
});

describe("notification delivery worker", () => {
  it("delivers queued messages: in-app into the bell, e-mail through the provider", async () => {
    await saveNotificationRule(s.admin, "LOW_STOCK", rule());
    await raiseLowStock();
    const providers = fakeProviders();

    const summary = await deliverDueNotifications({ providers });

    expect(summary).toEqual({ processed: 2, sent: 2, skipped: 0, failed: 0 });
    const email = providers.EMAIL as FakeChannel;
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]).toMatchObject({ recipient: "purchase@example.com", link: "/alerts" });
    expect(email.sent[0].text).toContain("Action Required: Reorder stock.");

    const [bell] = await prisma.notification.findMany({ where: { userId: s.admin.userId } });
    expect(bell).toMatchObject({ alertType: "LOW_STOCK", link: "/alerts", readAt: null });
    expect(bell.title).toContain("Low Stock Alert");

    const rows = await prisma.notificationOutbox.findMany({ include: { attemptLogs: true } });
    for (const row of rows) {
      expect(row).toMatchObject({ status: "SENT", attempts: 1, lastError: null });
      expect(row.sentAt).not.toBeNull();
      expect(row.attemptLogs).toMatchObject([{ attemptNo: 1, status: "SENT" }]);
    }
    // Nothing left to do.
    expect((await deliverDueNotifications({ providers })).processed).toBe(0);
  });

  it("backs off after a transient failure and succeeds on a later attempt", async () => {
    await saveNotificationRule(s.admin, "LOW_STOCK", rule({ inAppEnabled: false, inAppRoles: [] }));
    await raiseLowStock();
    let calls = 0;
    const flaky = new FakeChannel("EMAIL", () =>
      ++calls === 1 ? { status: "FAILED", error: "Connection timeout", retryable: true } : { status: "SENT" },
    );

    expect((await deliverDueNotifications({ providers: fakeProviders({ EMAIL: flaky }) })).failed).toBe(1);
    const failed = await prisma.notificationOutbox.findFirstOrThrow();
    expect(failed).toMatchObject({ status: "FAILED", attempts: 1, lastError: "Connection timeout" });
    expect(failed.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 60_000);

    // Not due yet…
    expect((await deliverDueNotifications({ providers: fakeProviders({ EMAIL: flaky }) })).processed).toBe(0);
    // …until the backoff has passed.
    await prisma.notificationOutbox.update({ where: { id: failed.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    expect((await deliverDueNotifications({ providers: fakeProviders({ EMAIL: flaky }) })).sent).toBe(1);

    const row = await prisma.notificationOutbox.findFirstOrThrow({ include: { attemptLogs: { orderBy: { attemptNo: "asc" } } } });
    expect(row).toMatchObject({ status: "SENT", attempts: 2 });
    expect(row.attemptLogs.map((a) => [a.attemptNo, a.status, a.error])).toEqual([
      [1, "FAILED", "Connection timeout"],
      [2, "SENT", null],
    ]);
  });

  it("stops retrying permanent failures until an administrator retries", async () => {
    await saveNotificationRule(s.admin, "LOW_STOCK", rule({ inAppEnabled: false, inAppRoles: [] }));
    await raiseLowStock();
    const rejecting = new FakeChannel("EMAIL", () => ({ status: "FAILED", error: "550 unknown mailbox", retryable: false }));

    await deliverDueNotifications({ providers: fakeProviders({ EMAIL: rejecting }) });
    const failed = await prisma.notificationOutbox.findFirstOrThrow();
    expect(failed).toMatchObject({ status: "FAILED", attempts: MAX_DELIVERY_ATTEMPTS });

    await prisma.notificationOutbox.update({ where: { id: failed.id }, data: { nextAttemptAt: new Date(0) } });
    expect((await deliverDueNotifications({ providers: fakeProviders() })).processed).toBe(0);

    await retryDelivery(s.admin, failed.id);
    expect((await deliverDueNotifications({ providers: fakeProviders() })).sent).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "NOTIFICATION_RETRIED", entityId: failed.id } })).toBe(1);
    await expect(retryDelivery(s.admin, failed.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("records unconfigured channels as skipped (log-only) and never retries them", async () => {
    await saveNotificationRule(s.admin, "LOW_STOCK", rule({ whatsappEnabled: true, whatsappRecipients: ["919876543210"] }));
    await raiseLowStock();
    const env = getEnv();
    const providers = createChannelProviders({ ...env, SMTP_HOST: undefined, WHATSAPP_ACCESS_TOKEN: undefined });

    const summary = await deliverDueNotifications({ providers });

    expect(summary).toEqual({ processed: 3, sent: 1, skipped: 2, failed: 0 });
    const skipped = await prisma.notificationOutbox.findMany({ where: { status: "SKIPPED" } });
    expect(skipped.map((r) => r.channel).sort()).toEqual(["EMAIL", "WHATSAPP"]);
    expect(skipped.every((r) => r.lastError === "skipped: not configured")).toBe(true);
    expect((await deliverDueNotifications({ providers })).processed).toBe(0);
  });

  it("never sends the same message twice when workers run concurrently", async () => {
    await saveNotificationRule(s.admin, "LOW_STOCK", rule({ inAppEnabled: false, inAppRoles: [], emailRecipients: ["a@example.com", "b@example.com", "c@example.com"] }));
    await raiseLowStock();
    const slow = new FakeChannel("EMAIL", async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { status: "SENT" };
    });

    const results = await Promise.all([1, 2, 3].map(() => deliverDueNotifications({ providers: fakeProviders({ EMAIL: slow }), limit: 2 })));

    expect(results.reduce((n, r) => n + r.processed, 0)).toBe(3);
    expect(slow.sent.map((m) => m.recipient).sort()).toEqual(["a@example.com", "b@example.com", "c@example.com"]);
  });

  it("re-claims a delivery whose worker died mid-send once the lease expires", async () => {
    await saveNotificationRule(s.admin, "LOW_STOCK", rule({ inAppEnabled: false, inAppRoles: [] }));
    await raiseLowStock();
    await prisma.notificationOutbox.updateMany({
      data: { status: "IN_PROGRESS", attempts: 1, lockedUntil: new Date(Date.now() - 1000) },
    });
    const summary = await deliverDueNotifications({ providers: fakeProviders() });
    expect(summary.sent).toBe(1);
    expect(await prisma.notificationOutbox.findFirstOrThrow()).toMatchObject({ status: "SENT", attempts: 2 });
  });
});

describe("daily digest", () => {
  const lowStockOnly = (digests: Awaited<ReturnType<typeof runDigestsIfDue>>) => digests.filter((d) => d.alertType === "LOW_STOCK");

  it("summarises all active alerts once a day at the digest time", async () => {
    await saveNotificationRule(s.admin, "LOW_STOCK", rule({ frequency: "DAILY_DIGEST", digestTime: "09:00", emailEnabled: false, emailRecipients: [] }));
    await raiseLowStock();
    expect(await prisma.notificationOutbox.count()).toBe(0);

    // 08:59 IST: not yet.
    expect(lowStockOnly(await runDigestsIfDue(new Date("2026-09-24T03:29:00Z")))).toEqual([]);

    expect(lowStockOnly(await runDigestsIfDue(MORNING))).toEqual([{ alertType: "LOW_STOCK", alerts: 1, queued: 1 }]);
    const [row] = await prisma.notificationOutbox.findMany();
    expect(row.subject).toBe("Low Stock Digest 24 Sept 2026: 1 product at or below minimum");
    expect(row.body).toContain(`${s.sku.name} (${s.sku.code}) at ${s.godown.name}: 10 KG (minimum 20 KG)`);
    expect(row.stockAlertId).toBeNull();

    // Once per day, even if the worker runs again or in parallel.
    const again = await Promise.all([runDigestsIfDue(MORNING), runDigestsIfDue(new Date("2026-09-24T12:00:00Z"))]);
    expect(lowStockOnly(again.flat())).toEqual([]);
    expect(await prisma.notificationOutbox.count()).toBe(1);

    // The next day it runs again.
    expect(lowStockOnly(await runDigestsIfDue(new Date("2026-09-25T04:00:00Z")))).toHaveLength(1);
  });

  it("marks the day done without a message when nothing is active", async () => {
    await saveNotificationRule(s.admin, "LOW_STOCK", rule({ frequency: "DAILY_DIGEST" }));
    expect(lowStockOnly(await runDigestsIfDue(MORNING))).toEqual([{ alertType: "LOW_STOCK", alerts: 0, queued: 0 }]);
    expect(await prisma.notificationOutbox.count()).toBe(0);
  });

  it("runs as part of a worker pass, followed by delivery", async () => {
    await saveNotificationRule(s.admin, "LOW_STOCK", rule({ frequency: "DAILY_DIGEST", emailEnabled: false, emailRecipients: [] }));
    await raiseLowStock();
    const result = await runNotificationWorker({ now: MORNING, providers: fakeProviders() });
    expect(lowStockOnly(result.digests)).toHaveLength(1);
    expect(result.delivery).toMatchObject({ processed: 1, sent: 1 });
    expect(await prisma.notification.count({ where: { userId: s.admin.userId } })).toBe(1);
  });
});

describe("send test", () => {
  it("delivers right away and audits the outcome", async () => {
    const email = new FakeChannel("EMAIL");
    const result = await sendTestNotification(s.admin, "EMAIL", "Me@Example.com", fakeProviders({ EMAIL: email }));
    expect(result).toEqual({ channel: "EMAIL", recipient: "me@example.com", result: { status: "SENT" } });
    expect(email.sent[0].text).toBe("Test message from Margix IMS: E-mail notifications are working.");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "NOTIFICATION_TEST_SENT" } });
    expect(audit).toMatchObject({ entityId: "EMAIL", newData: { recipient: "me@example.com", status: "SENT" } });
  });

  it("sends in-app tests to the caller and validates addresses", async () => {
    await sendTestNotification(s.admin, "IN_APP", undefined, fakeProviders());
    expect(await prisma.notification.count({ where: { userId: s.admin.userId } })).toBe(1);
    await expect(sendTestNotification(s.admin, "WHATSAPP", "12", fakeProviders())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(sendTestNotification(s.admin, "EMAIL", undefined, fakeProviders())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
