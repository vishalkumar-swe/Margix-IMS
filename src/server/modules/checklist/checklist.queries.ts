import type { RoleCode } from "@prisma/client";
import {
  CHECKLIST_SYSTEM_ITEMS,
  type ChecklistItem,
  type ChecklistSystemItemKey,
  type DailyChecklist,
} from "@/lib/checklist";
import { addDays, dateOnlyToUtc } from "@/lib/dates";
import { can, type Permission } from "@/lib/permissions";
import { checklistSettingsSchema, type ChecklistSettings } from "@/lib/validation/checklist";
import { prisma } from "@/server/db/client";
import type { Tx } from "@/server/db/transaction";
import { istClock } from "@/server/modules/notifications/notification-schedule";
import { listIdleStock } from "@/server/modules/reports/reports.queries";
import { readAppSetting } from "@/server/modules/settings/app-settings";
import { getStockAgingSettings } from "@/server/modules/settings/stock-aging";
import { summarizeStatuses, systemItemStatus, taskAppliesTo, taskStatus } from "./checklist-status";

export const DEFAULT_CHECKLIST_SETTINGS: ChecklistSettings = {
  disabledItems: [],
  showOnLogin: true,
  confirmOnLogout: true,
};

/** Invoices with nothing dispatched become overdue after this many days. */
const DISPATCH_OVERDUE_DAYS = 3;
/** Invoices not fully dispatched after this many days are "outstanding". */
const OUTSTANDING_DAYS = 7;
const RECENT_RETURN_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getChecklistSettings(db: Tx = prisma): Promise<ChecklistSettings> {
  return readAppSetting("checklist", checklistSettingsSchema, DEFAULT_CHECKLIST_SETTINGS, db);
}

/** Who sees each system item: users allowed to open the page it points to. */
const ITEM_PERMISSIONS: Record<ChecklistSystemItemKey, Permission> = {
  LOW_STOCK: "alert.view",
  SLOW_MOVING: "report.view",
  PENDING_PURCHASE_ORDERS: "po.view",
  INVOICES_AWAITING_DISPATCH: "invoice.view",
  PARTIAL_DISPATCHES: "dispatch.view",
  OUTSTANDING_INVOICES: "invoice.view",
  RECENT_RETURNS: "return.view",
  PENDING_APPROVALS: "adjustment.approve",
  TALLY_SYNC_FAILURES: "tally.view",
  NOTIFICATION_FAILURES: "settings.manage",
};

type SystemItem = Omit<ChecklistItem, "id" | "kind" | "title" | "dueTime" | "taskId">;
type Computation = (ctx: { now: Date; today: string }) => Promise<SystemItem>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How each system item is computed from live data. */
const COMPUTE: Record<ChecklistSystemItemKey, Computation> = {
  async LOW_STOCK() {
    const [count, outOfStock] = await Promise.all([
      prisma.stockAlert.count({ where: { alertType: "LOW_STOCK", status: "ACTIVE" } }),
      prisma.stockAlert.count({ where: { alertType: "LOW_STOCK", status: "ACTIVE", currentQty: { lte: 0 } } }),
    ]);
    return {
      count,
      status: systemItemStatus(count, { critical: outOfStock > 0 }),
      detail: count ? `${plural(count, "product")} at or below minimum${outOfStock ? `, ${outOfStock} out of stock` : ""}.` : null,
      href: "/alerts",
    };
  },
  async SLOW_MOVING() {
    const { slowStockDays } = await getStockAgingSettings();
    const count = (await listIdleStock(slowStockDays)).length;
    return {
      count,
      status: systemItemStatus(count),
      detail: count ? `${plural(count, "item")} without movement for ${slowStockDays}+ days.` : null,
      href: "/reports/slow-stock",
    };
  },
  async PENDING_PURCHASE_ORDERS({ today }) {
    const where = { status: { in: ["OPEN" as const, "PARTIALLY_RECEIVED" as const] } };
    const [count, late] = await Promise.all([
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.count({ where: { ...where, expectedDate: { lt: dateOnlyToUtc(today) } } }),
    ]);
    return {
      count,
      status: systemItemStatus(count, { overdue: late > 0 }),
      detail: count ? `${plural(count, "order")} open or partially received${late ? `, ${late} past the expected date` : ""}.` : null,
      href: "/purchase-orders",
    };
  },
  async INVOICES_AWAITING_DISPATCH({ today }) {
    const [count, late] = await Promise.all([
      prisma.invoice.count({ where: { status: "OPEN" } }),
      prisma.invoice.count({ where: { status: "OPEN", invoiceDate: { lt: dateOnlyToUtc(addDays(today, -DISPATCH_OVERDUE_DAYS)) } } }),
    ]);
    return {
      count,
      status: systemItemStatus(count, { overdue: late > 0 }),
      detail: count ? `${plural(count, "invoice")} with nothing dispatched${late ? `, ${late} older than ${DISPATCH_OVERDUE_DAYS} days` : ""}.` : null,
      href: "/invoices?status=OPEN",
    };
  },
  async PARTIAL_DISPATCHES() {
    const count = await prisma.invoice.count({ where: { status: "PARTIALLY_DISPATCHED" } });
    return {
      count,
      status: systemItemStatus(count),
      detail: count ? `${plural(count, "invoice")} with quantity still to dispatch.` : null,
      href: "/invoices?status=PARTIALLY_DISPATCHED",
    };
  },
  async OUTSTANDING_INVOICES({ today }) {
    const count = await prisma.invoice.count({
      where: {
        status: { in: ["OPEN", "PARTIALLY_DISPATCHED"] },
        invoiceDate: { lt: dateOnlyToUtc(addDays(today, -OUTSTANDING_DAYS)) },
      },
    });
    return {
      count,
      status: systemItemStatus(count, { overdue: true }),
      detail: count ? `${plural(count, "invoice")} not fully dispatched after ${OUTSTANDING_DAYS} days.` : null,
      href: "/invoices",
    };
  },
  async RECENT_RETURNS({ now }) {
    const since = new Date(now.getTime() - RECENT_RETURN_DAYS * DAY_MS);
    const [customer, supplier] = await Promise.all([
      prisma.salesReturn.count({ where: { createdAt: { gte: since } } }),
      prisma.purchaseReturn.count({ where: { createdAt: { gte: since } } }),
    ]);
    const count = customer + supplier;
    return {
      count,
      status: systemItemStatus(count),
      detail: count ? `${customer} from customers, ${supplier} to suppliers in the last ${RECENT_RETURN_DAYS} days.` : null,
      href: customer >= supplier ? "/sales-returns" : "/purchase-returns",
    };
  },
  async PENDING_APPROVALS({ now }) {
    const [count, late] = await Promise.all([
      prisma.adjustment.count({ where: { status: "SUBMITTED" } }),
      prisma.adjustment.count({ where: { status: "SUBMITTED", submittedAt: { lt: new Date(now.getTime() - DAY_MS) } } }),
    ]);
    return {
      count,
      status: systemItemStatus(count, { overdue: late > 0 }),
      detail: count ? `${plural(count, "adjustment")} waiting for approval${late ? `, ${late} for over a day` : ""}.` : null,
      href: "/adjustments?status=SUBMITTED",
    };
  },
  async TALLY_SYNC_FAILURES() {
    const count = await prisma.tallySyncJob.count({ where: { status: "FAILED" } });
    return {
      count,
      status: systemItemStatus(count, { critical: true }),
      detail: count ? `${plural(count, "document")} not posted to Tally.` : null,
      href: "/tally?status=FAILED",
    };
  },
  async NOTIFICATION_FAILURES() {
    const count = await prisma.notificationOutbox.count({ where: { status: "FAILED" } });
    return {
      count,
      status: systemItemStatus(count, { critical: true }),
      detail: count ? `${plural(count, "message")} could not be delivered.` : null,
      href: "/admin/notifications",
    };
  },
};

/**
 * Today's checklist (IST) for a user: the enabled system items their role may
 * see, then the administrator tasks for their role with today's completion.
 */
export async function getDailyChecklist(user: { id: string; role: RoleCode }, now = new Date()): Promise<DailyChecklist> {
  const clock = istClock(now);
  const settings = await getChecklistSettings();
  const visible = CHECKLIST_SYSTEM_ITEMS.filter(
    (item) => !settings.disabledItems.includes(item.key) && can(user.role, ITEM_PERMISSIONS[item.key]),
  );

  const [systemItems, tasks, completions] = await Promise.all([
    Promise.all(
      visible.map(async (item): Promise<ChecklistItem> => ({
        id: `system:${item.key}`,
        kind: "system",
        title: item.label,
        dueTime: null,
        taskId: null,
        ...(await COMPUTE[item.key]({ now, today: clock.day })),
      })),
    ),
    prisma.checklistTask.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, description: true, roles: true, dueTime: true },
    }),
    prisma.checklistTaskCompletion.findMany({
      where: { userId: user.id, day: dateOnlyToUtc(clock.day) },
      select: { taskId: true },
    }),
  ]);

  const done = new Set(completions.map((c) => c.taskId));
  const taskItems: ChecklistItem[] = tasks
    .filter((task) => taskAppliesTo(task.roles, user.role))
    .map((task) => ({
      id: `task:${task.id}`,
      kind: "task",
      taskId: task.id,
      title: task.title,
      detail: task.description,
      dueTime: task.dueTime,
      count: null,
      href: null,
      status: taskStatus({ done: done.has(task.id), dueTime: task.dueTime }, clock.time),
    }));

  const items = [...systemItems, ...taskItems];
  return { day: clock.day, items, summary: summarizeStatuses(items), confirmOnLogout: settings.confirmOnLogout };
}

/** Whether to open the checklist automatically: first page of the IST day, when enabled. */
export async function shouldShowChecklistToday(userId: string, now = new Date()): Promise<boolean> {
  const settings = await getChecklistSettings();
  if (!settings.showOnLogin) return false;
  const seen = await prisma.checklistView.findUnique({
    where: { userId_day: { userId, day: dateOnlyToUtc(istClock(now).day) } },
    select: { userId: true },
  });
  return !seen;
}

/** All tasks for the administration screen. */
export function listChecklistTasks() {
  return prisma.checklistTask.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      description: true,
      roles: true,
      dueTime: true,
      isActive: true,
      sortOrder: true,
      updatedAt: true,
    },
  });
}
