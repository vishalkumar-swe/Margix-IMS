import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ChecklistSettingsForm } from "@/features/checklist/checklist-settings-form";
import { ChecklistTaskDialog, EMPTY_TASK } from "@/features/checklist/checklist-task-dialog";
import { DeleteTaskButton } from "@/features/checklist/delete-task-button";
import { ROLE_LABELS } from "@/lib/permissions";
import { requirePagePermission } from "@/server/auth/current-user";
import { getChecklistSettings, listChecklistTasks } from "@/server/modules/checklist/checklist.queries";

export const metadata: Metadata = { title: "Daily checklist" };

export default async function ChecklistAdminPage() {
  await requirePagePermission("settings.manage");
  const [settings, tasks] = await Promise.all([getChecklistSettings(), listChecklistTasks()]);

  return (
    <>
      <PageHeader
        title="Daily checklist"
        description="What users see in the checklist that opens on their first sign-in of the day (and from the dashboard or header at any time)."
      />

      <Card>
        <CardHeader title="Checklist items" />
        <CardBody>
          <ChecklistSettingsForm initial={settings} />
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Administrator tasks"
          description="Recurring daily tasks, e.g. payment follow-ups. Each user ticks them off for the day; unfinished tasks are overdue after their due time."
          actions={<ChecklistTaskDialog initial={EMPTY_TASK} />}
        />
        {tasks.length > 0 ? (
          <Table>
            <THead>
              <tr>
                <TH>Task</TH>
                <TH>Roles</TH>
                <TH>Due by</TH>
                <TH>Status</TH>
                <TH className="sr-only">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {tasks.map((task) => (
                <TR key={task.id}>
                  <TD>
                    <span className="font-medium">{task.title}</span>
                    {task.description && <span className="block text-xs text-slate-500">{task.description}</span>}
                  </TD>
                  <TD className="text-xs">{task.roles.length ? task.roles.map((r) => ROLE_LABELS[r]).join(", ") : "Everyone"}</TD>
                  <TD className="text-xs">{task.dueTime ?? "—"}</TD>
                  <TD>
                    <Badge tone={task.isActive ? "success" : "neutral"}>{task.isActive ? "Active" : "Inactive"}</Badge>
                  </TD>
                  <TD className="text-right whitespace-nowrap">
                    <ChecklistTaskDialog
                      taskId={task.id}
                      initial={{
                        title: task.title,
                        description: task.description ?? "",
                        roles: task.roles,
                        dueTime: task.dueTime ?? "",
                        isActive: task.isActive,
                        sortOrder: String(task.sortOrder),
                      }}
                    />
                    <DeleteTaskButton taskId={task.id} title={task.title} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={ListChecks} title="No tasks yet" description="Add tasks such as payment follow-ups or end-of-day checks." />
        )}
      </Card>
    </>
  );
}
