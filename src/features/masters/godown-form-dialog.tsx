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

export interface GodownFormValues {
  code: string;
  name: string;
  address: string;
  tallySyncEnabled: boolean;
  tallyGodownName: string;
  isActive: boolean;
}

export const EMPTY_GODOWN: GodownFormValues = {
  code: "",
  name: "",
  address: "",
  tallySyncEnabled: true,
  tallyGodownName: "",
  isActive: true,
};

export function GodownFormDialog({ godownId, initial }: { godownId?: string; initial: GodownFormValues }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const editing = Boolean(godownId);

  const save = useApiMutation(({ code, isActive, ...rest }: GodownFormValues) =>
    editing
      ? apiRequest(`/godowns/${godownId}`, { method: "PATCH", body: { ...rest, isActive } })
      : apiRequest("/godowns", { body: { ...rest, code } }),
  );
  const errors = save.fieldErrors;
  const set = <K extends keyof GodownFormValues>(key: K, value: GodownFormValues[K]) => setForm({ ...form, [key]: value });
  const id = (field: string) => `${godownId ?? "new"}-godown-${field}`;

  function openDialog() {
    setForm(initial);
    save.reset();
    setOpen(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (await save.mutate(form)) {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      {editing ? (
        <Button variant="ghost" size="sm" onClick={openDialog}>
          <Pencil aria-hidden /> Edit
        </Button>
      ) : (
        <Button onClick={openDialog}>
          <Plus aria-hidden /> New godown
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${initial.code}` : "New godown"}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {save.error && !Object.keys(errors).length && <Alert tone="error">{save.error.message}</Alert>}
          <Field label="Code" htmlFor={id("code")} error={errors.code} required={!editing}>
            <Input id={id("code")} value={form.code} disabled={editing} onChange={(e) => set("code", e.target.value)} />
          </Field>
          <Field label="Name" htmlFor={id("name")} error={errors.name} required>
            <Input id={id("name")} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Address" htmlFor={id("address")} error={errors.address}>
            <Textarea id={id("address")} value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Tally godown name" htmlFor={id("tally")} error={errors.tallyGodownName}>
            <Input id={id("tally")} value={form.tallyGodownName} onChange={(e) => set("tallyGodownName", e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.tallySyncEnabled}
              onChange={(e) => set("tallySyncEnabled", e.target.checked)}
              className="size-4 rounded border-slate-300"
            />
            Sync movements in this godown to Tally
          </label>
          {editing && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
                className="size-4 rounded border-slate-300"
              />
              Active (only godowns without stock can be deactivated)
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              {editing ? "Save changes" : "Create godown"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
