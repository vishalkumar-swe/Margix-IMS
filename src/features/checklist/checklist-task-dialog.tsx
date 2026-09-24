"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { ROLE_CODES } from "@/lib/enums";
import { ROLE_LABELS } from "@/lib/permissions";

export interface ChecklistTaskValues {
  title: string;
  description: string;
  roles: string[];
  dueTime: string;
  isActive: boolean;
  sortOrder: string;
}

export const EMPTY_TASK: ChecklistTaskValues = { title: "", description: "", roles: [], dueTime: "", isActive: true, sortOrder: "0" };

/** Create or edit an administrator-defined daily task. */
export function ChecklistTaskDialog({ taskId, initial }: { taskId?: string; initial: ChecklistTaskValues }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const save = useApiMutation((body: ChecklistTaskValues) => {
    const payload = { ...body, sortOrder: Number(body.sortOrder || 0) };
    return taskId
      ? apiRequest(`/checklist-settings/tasks/${taskId}`, { method: "PATCH", body: payload })
      : apiRequest("/checklist-settings/tasks", { body: payload });
  });
  const errors = save.fieldErrors;
  const id = (field: string) => `${taskId ?? "new"}-task-${field}`;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (await save.mutate(form)) {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      {taskId ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setForm(initial);
            save.reset();
            setOpen(true);
          }}
        >
          <Pencil aria-hidden /> Edit
        </Button>
      ) : (
        <Button
          onClick={() => {
            setForm(EMPTY_TASK);
            save.reset();
            setOpen(true);
          }}
        >
          <Plus aria-hidden /> New task
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={taskId ? "Edit task" : "New task"}
        description="Appears on the daily checklist of the chosen roles; each user ticks it off every day."
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {save.error && !Object.keys(errors).length && <Alert tone="error">{save.error.message}</Alert>}
          <Field label="Title" htmlFor={id("title")} error={errors.title} required>
            <Input
              id={id("title")}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Follow up overdue customer payments"
            />
          </Field>
          <Field label="Description" htmlFor={id("description")} error={errors.description}>
            <Textarea
              id={id("description")}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Roles</legend>
            <div className="grid grid-cols-2 gap-1 text-sm text-slate-700">
              {ROLE_CODES.map((role) => (
                <label key={role} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.roles.includes(role)}
                    onChange={(e) =>
                      setForm({ ...form, roles: e.target.checked ? [...form.roles, role] : form.roles.filter((r) => r !== role) })
                    }
                    className="size-4 rounded border-slate-300 accent-brand-500"
                  />
                  {ROLE_LABELS[role]}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">None selected = everyone.</p>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due by (IST)" htmlFor={id("due")} error={errors.dueTime} hint="Overdue after this time.">
              <Input id={id("due")} type="time" value={form.dueTime} onChange={(e) => setForm({ ...form, dueTime: e.target.value })} />
            </Field>
            <Field label="Order" htmlFor={id("order")} error={errors.sortOrder} hint="Lower first.">
              <Input
                id={id("order")}
                inputMode="numeric"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="size-4 rounded border-slate-300 accent-brand-500"
            />
            Active
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              Save task
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
