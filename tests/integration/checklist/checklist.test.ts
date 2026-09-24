import { beforeEach, describe, expect, it } from "vitest";
import type { ChecklistItem } from "@/lib/checklist";
import { addDays, dateOnlyToUtc, todayIst } from "@/lib/dates";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { saveReorderRule } from "@/server/modules/alerts/alerts.service";
import { getDailyChecklist, shouldShowChecklistToday } from "@/server/modules/checklist/checklist.queries";
import {
  createChecklistTask,
  deleteChecklistTask,
  markChecklistSeen,
  saveChecklistSettings,
  setTaskCompletion,
  updateChecklistTask,
} from "@/server/modules/checklist/checklist.service";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import { actorFor, createSupplier, createUser } from "../../helpers/factories";
import { stockedScenario, type StockedScenario } from "../../helpers/scenario";

let s: StockedScenario;

/** 2026-09-24, 09:00 and 11:00 IST. */
const NINE = new Date("2026-09-24T03:30:00Z");
const ELEVEN = new Date("2026-09-24T05:30:00Z");

const asUser = (actor: Actor) => ({ id: actor.userId, role: actor.role });
const item = (items: ChecklistItem[], id: string) => items.find((i) => i.id === id);

beforeEach(async () => {
  s = await stockedScenario("100");
});

describe("system items", () => {
  it("derive their status from live data", async () => {
    let { items } = await getDailyChecklist(asUser(s.admin));
    expect(item(items, "system:LOW_STOCK")).toMatchObject({ status: "COMPLETED", count: 0, href: "/alerts" });

    await saveReorderRule(s.manager, { skuId: s.sku.id, godownId: s.godown.id, reorderLevel: "150", isActive: true });
    ({ items } = await getDailyChecklist(asUser(s.admin)));
    expect(item(items, "system:LOW_STOCK")).toMatchObject({ status: "PENDING", count: 1 });

    // Out of stock is critical.
    await postDispatch(s.operator, { godownId: s.godown.id, items: [{ skuId: s.sku.id, batchId: s.batch.id, quantity: "100" }] });
    ({ items } = await getDailyChecklist(asUser(s.admin)));
    expect(item(items, "system:LOW_STOCK")).toMatchObject({ status: "CRITICAL", detail: "1 product at or below minimum, 1 out of stock." });
  });

  it("marks purchase orders past their expected date overdue and Tally failures critical", async () => {
    const supplier = await createSupplier();
    const today = todayIst();
    for (const [n, expected] of [[1, addDays(today, 5)], [2, addDays(today, -2)]] as const) {
      await prisma.purchaseOrder.create({
        data: {
          poNumber: `PO-T-${n}`,
          supplierId: supplier.id,
          status: "OPEN",
          orderDate: dateOnlyToUtc(addDays(today, -10)),
          expectedDate: dateOnlyToUtc(expected),
          createdById: s.admin.userId,
        },
      });
    }
    await prisma.tallySyncJob.create({ data: { entityType: "GRN", entityId: s.sku.id, entityNo: "GRN-X", status: "FAILED" } });

    const { items, summary } = await getDailyChecklist(asUser(s.admin));
    expect(item(items, "system:PENDING_PURCHASE_ORDERS")).toMatchObject({
      status: "OVERDUE",
      count: 2,
      detail: "2 orders open or partially received, 1 past the expected date.",
    });
    expect(item(items, "system:TALLY_SYNC_FAILURES")).toMatchObject({ status: "CRITICAL", count: 1 });
    expect(summary.CRITICAL).toBeGreaterThanOrEqual(1);
  });

  it("shows each role only the items it may open", async () => {
    const operator = (await getDailyChecklist(asUser(s.operator))).items.map((i) => i.id);
    expect(operator).toContain("system:LOW_STOCK");
    expect(operator).not.toContain("system:PENDING_APPROVALS");
    expect(operator).not.toContain("system:TALLY_SYNC_FAILURES");
    expect(operator).not.toContain("system:NOTIFICATION_FAILURES");

    const admin = (await getDailyChecklist(asUser(s.admin))).items.map((i) => i.id);
    expect(admin).toEqual(expect.arrayContaining(["system:PENDING_APPROVALS", "system:TALLY_SYNC_FAILURES", "system:NOTIFICATION_FAILURES"]));
  });

  it("can be switched off by an administrator (audited)", async () => {
    await saveChecklistSettings(s.admin, { disabledItems: ["LOW_STOCK", "RECENT_RETURNS"], showOnLogin: true, confirmOnLogout: false });
    const checklist = await getDailyChecklist(asUser(s.manager));
    expect(checklist.items.map((i) => i.id)).not.toContain("system:LOW_STOCK");
    expect(checklist.items.map((i) => i.id)).not.toContain("system:RECENT_RETURNS");
    expect(checklist.confirmOnLogout).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "SETTINGS_UPDATED", entityId: "checklist" } })).toBe(1);
  });
});

describe("administrator tasks", () => {
  it("apply to their roles, turn overdue after the due time and are ticked per user per day", async () => {
    const everyone = await createChecklistTask(s.admin, {
      title: "Check the loading bay",
      roles: [],
      dueTime: "10:00",
      isActive: true,
      sortOrder: 0,
    });
    await createChecklistTask(s.admin, {
      title: "Follow up overdue customer payments",
      roles: ["ACCOUNTS"],
      isActive: true,
      sortOrder: 1,
    });
    const accounts = actorFor(await createUser("ACCOUNTS"));

    const managerItems = (await getDailyChecklist(asUser(s.manager), NINE)).items.filter((i) => i.kind === "task");
    expect(managerItems.map((i) => [i.title, i.status])).toEqual([["Check the loading bay", "PENDING"]]);
    const accountsItems = (await getDailyChecklist(asUser(accounts), ELEVEN)).items.filter((i) => i.kind === "task");
    expect(accountsItems.map((i) => [i.title, i.status])).toEqual([
      ["Check the loading bay", "OVERDUE"],
      ["Follow up overdue customer payments", "PENDING"],
    ]);

    await setTaskCompletion(s.manager, everyone.id, true, ELEVEN);
    expect(item((await getDailyChecklist(asUser(s.manager), ELEVEN)).items, `task:${everyone.id}`)?.status).toBe("COMPLETED");
    // Done for this user only, and only today.
    expect(item((await getDailyChecklist(asUser(accounts), ELEVEN)).items, `task:${everyone.id}`)?.status).toBe("OVERDUE");
    expect(item((await getDailyChecklist(asUser(s.manager), new Date("2026-09-25T03:30:00Z"))).items, `task:${everyone.id}`)?.status).toBe(
      "PENDING",
    );

    await setTaskCompletion(s.manager, everyone.id, false, ELEVEN);
    expect(item((await getDailyChecklist(asUser(s.manager), ELEVEN)).items, `task:${everyone.id}`)?.status).toBe("OVERDUE");
    expect(await prisma.auditLog.count({ where: { action: { in: ["CHECKLIST_TASK_COMPLETED", "CHECKLIST_TASK_REOPENED"] } } })).toBe(2);
  });

  it("cannot be ticked by a role they do not apply to, or once inactive", async () => {
    const task = await createChecklistTask(s.admin, { title: "Accounts only", roles: ["ACCOUNTS"], isActive: true, sortOrder: 0 });
    await expect(setTaskCompletion(s.operator, task.id, true)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await updateChecklistTask(s.admin, task.id, { title: "Everyone", roles: [], isActive: false, sortOrder: 0 });
    await expect(setTaskCompletion(s.operator, task.id, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getDailyChecklist(asUser(s.operator))).items.some((i) => i.kind === "task")).toBe(false);
  });

  it("are audited when created, changed and deleted", async () => {
    const task = await createChecklistTask(s.admin, { title: "Count cash", roles: [], isActive: true, sortOrder: 0 });
    await setTaskCompletion(s.admin, task.id, true);
    await updateChecklistTask(s.admin, task.id, { title: "Count petty cash", roles: [], isActive: true, sortOrder: 0 });
    await deleteChecklistTask(s.admin, task.id);
    expect(await prisma.checklistTaskCompletion.count()).toBe(0);
    const actions = (await prisma.auditLog.findMany({ where: { entityType: "ChecklistTask" }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["CHECKLIST_TASK_CREATED", "CHECKLIST_TASK_COMPLETED", "CHECKLIST_TASK_UPDATED", "CHECKLIST_TASK_DELETED"]);
  });
});

describe("daily popup", () => {
  it("opens once per IST day per user, unless switched off", async () => {
    expect(await shouldShowChecklistToday(s.manager.userId, NINE)).toBe(true);
    await markChecklistSeen(s.manager.userId, NINE);
    await markChecklistSeen(s.manager.userId, ELEVEN); // idempotent
    expect(await shouldShowChecklistToday(s.manager.userId, ELEVEN)).toBe(false);
    expect(await shouldShowChecklistToday(s.operator.userId, ELEVEN)).toBe(true);
    // 23:00 UTC on the 24th is already the 25th in India.
    expect(await shouldShowChecklistToday(s.manager.userId, new Date("2026-09-24T23:00:00Z"))).toBe(true);

    await saveChecklistSettings(s.admin, { disabledItems: [], showOnLogin: false, confirmOnLogout: true });
    expect(await shouldShowChecklistToday(s.operator.userId, ELEVEN)).toBe(false);
  });
});
