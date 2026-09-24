import { beforeEach, describe, expect, it } from "vitest";
import { GET as checklistGet } from "@/app/api/v1/checklist/route";
import { POST as seenPost } from "@/app/api/v1/checklist/seen/route";
import { POST as completionPost } from "@/app/api/v1/checklist/tasks/[id]/completion/route";
import { PATCH as checklistSettingsPatch } from "@/app/api/v1/checklist-settings/route";
import { POST as taskPost } from "@/app/api/v1/checklist-settings/tasks/route";
import { DELETE as taskDelete } from "@/app/api/v1/checklist-settings/tasks/[id]/route";
import { GET as dispatchesGet } from "@/app/api/v1/dispatches/route";
import { PATCH as rulePatch } from "@/app/api/v1/notification-settings/rules/[alertType]/route";
import { PATCH as agingPatch } from "@/app/api/v1/notification-settings/stock-aging/route";
import { POST as testPost } from "@/app/api/v1/notification-settings/channels/[channel]/test/route";
import { POST as retryPost } from "@/app/api/v1/notification-settings/deliveries/[id]/retry/route";
import { GET as notificationsGet } from "@/app/api/v1/notifications/route";
import { POST as readPost } from "@/app/api/v1/notifications/[id]/read/route";
import { POST as readAllPost } from "@/app/api/v1/notifications/read-all/route";
import { GET as purchaseOrdersGet } from "@/app/api/v1/purchase-orders/route";
import { prisma } from "@/server/db/client";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import { createSku } from "../../helpers/factories";
import { callRoute, sessionCookieFor } from "../../helpers/http";
import { stockedScenario, type StockedScenario } from "../../helpers/scenario";

let s: StockedScenario;
let admin: string;
let manager: string;
let operator: string;

const rule = {
  isEnabled: true,
  frequency: "DAILY_DIGEST",
  digestTime: "08:30",
  inAppEnabled: true,
  emailEnabled: true,
  whatsappEnabled: true,
  inAppRoles: ["ADMIN"],
  inAppUserIds: [],
  emailRecipients: ["stores@example.com"],
  whatsappRecipients: ["+91 98765 43210"],
};

beforeEach(async () => {
  s = await stockedScenario("100");
  admin = await sessionCookieFor(s.admin.userId);
  manager = await sessionCookieFor(s.manager.userId);
  operator = await sessionCookieFor(s.operator.userId);
});

describe("notification settings API", () => {
  it("is for administrators only (settings.manage)", async () => {
    const params = { alertType: "LOW_STOCK" };
    expect((await callRoute(rulePatch, { method: "PATCH", cookie: manager, params, body: rule })).status).toBe(403);
    expect((await callRoute(agingPatch, { method: "PATCH", cookie: manager, body: { slowStockDays: 10, deadStockDays: 20, scanTime: "08:00" } })).status).toBe(403);
    expect((await callRoute(testPost, { cookie: operator, params: { channel: "IN_APP" }, body: {} })).status).toBe(403);
    expect((await callRoute(checklistSettingsPatch, { method: "PATCH", cookie: manager, body: { disabledItems: [], showOnLogin: true, confirmOnLogout: true } })).status).toBe(403);
    expect((await callRoute(taskPost, { cookie: manager, body: { title: "x", roles: [], isActive: true } })).status).toBe(403);
    expect(await prisma.auditLog.count({ where: { action: { in: ["NOTIFICATION_RULE_SAVED", "SETTINGS_UPDATED"] } } })).toBe(0);
  });

  it("saves a rule with normalised recipients", async () => {
    const response = await callRoute(rulePatch, { method: "PATCH", cookie: admin, params: { alertType: "LOW_STOCK" }, body: rule });
    expect(response.status).toBe(200);
    expect(response.json.data).toMatchObject({ frequency: "DAILY_DIGEST", whatsappRecipients: ["919876543210"], customised: true });

    const unknown = await callRoute(rulePatch, { method: "PATCH", cookie: admin, params: { alertType: "EXPIRY" }, body: rule });
    expect(unknown.status).toBe(404);

    const invalid = await callRoute(rulePatch, {
      method: "PATCH",
      cookie: admin,
      params: { alertType: "LOW_STOCK" },
      body: { ...rule, emailRecipients: ["not-an-email"] },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.json.error?.details).toEqual([{ path: "emailRecipients.0", message: "Enter valid e-mail addresses." }]);
  });

  it("sends an in-app test and reports log-only channels as skipped", async () => {
    const inApp = await callRoute(testPost, { cookie: admin, params: { channel: "IN_APP" }, body: {} });
    expect(inApp.json.data).toMatchObject({ channel: "IN_APP", result: { status: "SENT" } });

    // The test environment has no SMTP settings, so e-mail runs log-only.
    const email = await callRoute(testPost, { cookie: admin, params: { channel: "EMAIL" }, body: { recipient: "me@example.com" } });
    expect(email.json.data).toMatchObject({ result: { status: "SKIPPED", reason: "skipped: not configured" } });

    const retry = await callRoute(retryPost, { cookie: admin, params: { id: "00000000-0000-4000-8000-000000000000" } });
    expect(retry.status).toBe(404);
  });
});

describe("notification centre API", () => {
  it("lists only the caller's own notifications and marks them read", async () => {
    const mine = await prisma.notification.create({ data: { userId: s.manager.userId, title: "Low stock", body: "…", link: "/alerts" } });
    await prisma.notification.create({ data: { userId: s.manager.userId, title: "Second", body: "…" } });
    const theirs = await prisma.notification.create({ data: { userId: s.admin.userId, title: "Admin only", body: "…" } });

    const list = await callRoute<{ items: { id: string }[]; unread: number }>(notificationsGet, { cookie: manager, path: "/api/v1/notifications?limit=5" });
    expect(list.json.data!.unread).toBe(2);
    expect(list.json.data!.items.map((i) => i.id)).not.toContain(theirs.id);

    expect((await callRoute(readPost, { cookie: manager, params: { id: theirs.id } })).status).toBe(404);
    expect((await callRoute(readPost, { cookie: manager, params: { id: mine.id } })).status).toBe(200);
    expect((await callRoute<{ unread: number }>(notificationsGet, { cookie: manager })).json.data!.unread).toBe(1);

    expect((await callRoute(readAllPost, { cookie: manager })).json.data).toEqual({ updated: 1 });
    expect(await prisma.notification.count({ where: { readAt: null } })).toBe(1); // the admin's
  });
});

describe("checklist API", () => {
  it("serves today's checklist, records the popup and ticks tasks", async () => {
    const created = await callRoute<{ id: string }>(taskPost, {
      cookie: admin,
      body: { title: "Follow up payments", roles: ["STORE_MANAGER"], dueTime: "", isActive: true },
    });
    expect(created.status).toBe(201);
    const taskId = created.json.data!.id;

    const checklist = await callRoute<{ items: { id: string; status: string }[]; confirmOnLogout: boolean }>(checklistGet, { cookie: manager });
    expect(checklist.status).toBe(200);
    expect(checklist.json.data!.items.map((i) => i.id)).toContain(`task:${taskId}`);
    expect(checklist.json.data!.confirmOnLogout).toBe(true);

    expect((await callRoute(seenPost, { cookie: manager })).status).toBe(200);
    expect(await prisma.checklistView.count({ where: { userId: s.manager.userId } })).toBe(1);

    expect((await callRoute(completionPost, { cookie: operator, params: { id: taskId }, body: { done: true } })).status).toBe(404);
    expect((await callRoute(completionPost, { cookie: manager, params: { id: taskId }, body: { done: true } })).status).toBe(200);
    const after = await callRoute<{ items: { id: string; status: string }[] }>(checklistGet, { cookie: manager });
    expect(after.json.data!.items.find((i) => i.id === `task:${taskId}`)?.status).toBe("COMPLETED");

    expect((await callRoute(taskDelete, { method: "DELETE", cookie: admin, params: { id: taskId } })).status).toBe(200);
  });
});

describe("history filters", () => {
  it("narrow dispatches and purchase orders to one product", async () => {
    await postDispatch(s.operator, { godownId: s.godown.id, items: [{ skuId: s.sku.id, batchId: s.batch.id, quantity: "1" }] });
    const other = await createSku();

    const forSku = await callRoute<{ items: unknown[] }>(dispatchesGet, { cookie: manager, path: `/api/v1/dispatches?skuId=${s.sku.id}` });
    expect(forSku.json.data!.items).toHaveLength(1);
    const forOther = await callRoute<{ items: unknown[] }>(dispatchesGet, { cookie: manager, path: `/api/v1/dispatches?skuId=${other.id}` });
    expect(forOther.json.data!.items).toHaveLength(0);
    const orders = await callRoute<{ items: unknown[] }>(purchaseOrdersGet, { cookie: manager, path: `/api/v1/purchase-orders?skuId=${other.id}` });
    expect(orders.status).toBe(200);
    expect(orders.json.data!.items).toHaveLength(0);
  });
});
