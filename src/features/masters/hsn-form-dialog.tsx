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

export interface HsnFormValues {
  code: string;
  description: string;
  gstRate: string;
  keywords: string;
  isActive: boolean;
}

export const EMPTY_HSN: HsnFormValues = { code: "", description: "", gstRate: "", keywords: "", isActive: true };

/** Add (no `editing`) or edit an HSN/SAC code. The code itself is fixed once created. */
export function HsnFormDialog({ initial, editing = false }: { initial: HsnFormValues; editing?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const save = useApiMutation(({ code, isActive, ...rest }: HsnFormValues) =>
    editing
      ? apiRequest(`/hsn/${code}`, { method: "PATCH", body: { ...rest, isActive } })
      : apiRequest("/hsn", { body: { code, ...rest } }),
  );
  const errors = save.fieldErrors;
  const set = <K extends keyof HsnFormValues>(key: K, value: HsnFormValues[K]) => setForm({ ...form, [key]: value });
  const id = (field: string) => `hsn-${initial.code || "new"}-${field}`;

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
          <Plus aria-hidden /> New HSN code
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? `Edit HSN ${initial.code}` : "New HSN / SAC code"}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {save.error && !Object.keys(errors).length && <Alert tone="error">{save.error.message}</Alert>}
          <div className="grid grid-cols-2 gap-4">
            <Field label="HSN / SAC code" htmlFor={id("code")} error={errors.code} required={!editing} hint="4, 6 or 8 digits.">
              <Input id={id("code")} inputMode="numeric" value={form.code} disabled={editing} onChange={(e) => set("code", e.target.value)} />
            </Field>
            <Field label="GST %" htmlFor={id("gst")} error={errors.gstRate} required>
              <Input id={id("gst")} inputMode="decimal" value={form.gstRate} onChange={(e) => set("gstRate", e.target.value)} />
            </Field>
          </div>
          <Field label="Description" htmlFor={id("description")} error={errors.description} required>
            <Textarea id={id("description")} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field
            label="Search keywords"
            htmlFor={id("keywords")}
            error={errors.keywords}
            hint="Trade names and synonyms that help suggestions, e.g. bottle jar container."
          >
            <Input id={id("keywords")} value={form.keywords} onChange={(e) => set("keywords", e.target.value)} />
          </Field>
          {editing && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
                className="size-4 rounded border-slate-300"
              />
              Active (inactive codes are not suggested or selectable)
            </label>
          )}
          {editing && (
            <p className="text-xs text-slate-500">
              Changing the rate updates products that follow this HSN&apos;s rate. Posted documents keep their rate.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              {editing ? "Save changes" : "Add code"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
