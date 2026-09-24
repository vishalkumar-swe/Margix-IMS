import type { ChecklistTask } from "@prisma/client";
import { dateOnlyToUtc } from "@/lib/dates";
import { checklistSettingsSchema, type ChecklistSettings, type ChecklistTaskInput } from "@/lib/validation/checklist";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { withTx } from "@/server/db/transaction";
import { NotFoundError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { istClock } from "@/server/modules/notifications/notification-schedule";
import { writeAppSetting } from "@/server/modules/settings/app-settings";
import { taskAppliesTo } from "./checklist-status";
import { getChecklistSettings } from "./checklist.queries";

/** Records that the checklist popup was shown today, so it opens by itself only once a day. */
export async function markChecklistSeen(userId: string, now = new Date()): Promise<void> {
  await prisma.checklistView.createMany({
    data: [{ userId, day: dateOnlyToUtc(istClock(now).day) }],
    skipDuplicates: true,
  });
}

/** Ticks an administrator task done (or reopens it) for the user, for today (IST). */
export function setTaskCompletion(actor: Actor, taskId: string, done: boolean, now = new Date()): Promise<{ done: boolean }> {
  return withTx(async (tx) => {
    const task = await tx.checklistTask.findUnique({ where: { id: taskId }, select: { isActive: true, roles: true, title: true } });
    if (!task?.isActive || !taskAppliesTo(task.roles, actor.role)) throw new NotFoundError("Checklist task", taskId);

    const key = { taskId, userId: actor.userId, day: dateOnlyToUtc(istClock(now).day) };
    const changed = done
      ? (await tx.checklistTaskCompletion.createMany({ data: [key], skipDuplicates: true })).count
      : (await tx.checklistTaskCompletion.deleteMany({ where: key })).count;
    if (changed > 0) {
      await recordAudit(tx, actor, {
        action: done ? "CHECKLIST_TASK_COMPLETED" : "CHECKLIST_TASK_REOPENED",
        entityType: "ChecklistTask",
        entityId: taskId,
        newData: { title: task.title, day: istClock(now).day },
      });
    }
    return { done };
  });
}

export function saveChecklistSettings(actor: Actor, input: ChecklistSettings): Promise<ChecklistSettings> {
  return withTx(async (tx) => {
    const current = await getChecklistSettings(tx);
    const next = checklistSettingsSchema.parse(input);
    await writeAppSetting(tx, actor, "checklist", current, next);
    return next;
  });
}

export function createChecklistTask(actor: Actor, input: ChecklistTaskInput): Promise<ChecklistTask> {
  return withTx(async (tx) => {
    const task = await tx.checklistTask.create({
      data: { ...taskData(input), createdById: actor.userId },
    });
    await recordAudit(tx, actor, { action: "CHECKLIST_TASK_CREATED", entityType: "ChecklistTask", entityId: task.id, newData: task });
    return task;
  });
}

export function updateChecklistTask(actor: Actor, id: string, input: ChecklistTaskInput): Promise<ChecklistTask> {
  return withTx(async (tx) => {
    const before = await tx.checklistTask.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Checklist task", id);
    const task = await tx.checklistTask.update({ where: { id }, data: taskData(input) });
    await recordAudit(tx, actor, {
      action: "CHECKLIST_TASK_UPDATED",
      entityType: "ChecklistTask",
      entityId: id,
      oldData: before,
      newData: task,
    });
    return task;
  });
}

/** Deletes a task and its completion history (deactivate it instead to keep the history). */
export function deleteChecklistTask(actor: Actor, id: string): Promise<void> {
  return withTx(async (tx) => {
    const before = await tx.checklistTask.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Checklist task", id);
    await tx.checklistTask.delete({ where: { id } });
    await recordAudit(tx, actor, { action: "CHECKLIST_TASK_DELETED", entityType: "ChecklistTask", entityId: id, oldData: before });
  });
}

function taskData(input: ChecklistTaskInput) {
  return {
    title: input.title,
    description: input.description ?? null,
    roles: input.roles,
    dueTime: input.dueTime ?? null,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };
}
