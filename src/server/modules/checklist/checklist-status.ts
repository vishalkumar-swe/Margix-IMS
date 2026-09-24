import type { RoleCode } from "@prisma/client";
import { CHECKLIST_STATUSES, type ChecklistItem, type ChecklistStatus } from "@/lib/checklist";

/**
 * Status rules of the daily checklist (pure functions).
 *
 * System items describe live data: nothing to do → Completed; otherwise
 * Critical (e.g. out of stock, Tally failures) before Overdue (past a due
 * date) before Pending.
 */
export function systemItemStatus(count: number, flags: { critical?: boolean; overdue?: boolean } = {}): ChecklistStatus {
  if (count === 0) return "COMPLETED";
  if (flags.critical) return "CRITICAL";
  if (flags.overdue) return "OVERDUE";
  return "PENDING";
}

/**
 * Administrator tasks are ticked done per user per IST day. An unfinished
 * task becomes overdue once its due time ("HH:MM", IST) has passed.
 */
export function taskStatus(task: { done: boolean; dueTime: string | null }, nowTime: string): ChecklistStatus {
  if (task.done) return "COMPLETED";
  if (task.dueTime && nowTime >= task.dueTime) return "OVERDUE";
  return "PENDING";
}

/** A task with no roles applies to everyone. */
export function taskAppliesTo(roles: readonly RoleCode[], role: RoleCode): boolean {
  return roles.length === 0 || roles.includes(role);
}

export function summarizeStatuses(items: Pick<ChecklistItem, "status">[]): Record<ChecklistStatus, number> {
  const summary = Object.fromEntries(CHECKLIST_STATUSES.map((s) => [s, 0])) as Record<ChecklistStatus, number>;
  for (const item of items) summary[item.status]++;
  return summary;
}
