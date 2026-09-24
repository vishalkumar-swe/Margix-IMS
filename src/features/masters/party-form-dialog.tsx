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

export interface PartyFormValues {
  code: string;
  name: string;
  gstin: string;
  email: string;
  phone: string;
  address: string;
  isActive: boolean;
}

export const EMPTY_PARTY: PartyFormValues = { code: "", name: "", gstin: "", email: "", phone: "", address: "", isActive: true };

/** Supplier or customer create/edit (same fields, different endpoint). */
export function PartyFormDialog({
  kind,
  partyId,
  initial,
}: {
  kind: "supplier" | "customer";
  partyId?: string;
  initial: PartyFormValues;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const editing = Boolean(partyId);
  const endpoint = kind === "supplier" ? "/suppliers" : "/customers";
  const noun = kind === "supplier" ? "supplier" : "customer";

  const save = useApiMutation(({ code, isActive, ...rest }: PartyFormValues) =>
    editing
      ? apiRequest(`${endpoint}/${partyId}`, { method: "PATCH", body: { ...rest, isActive } })
      : apiRequest(endpoint, { body: { ...rest, code } }),
  );
  const errors = save.fieldErrors;
  const set = <K extends keyof PartyFormValues>(key: K, value: PartyFormValues[K]) => setForm({ ...form, [key]: value });
  const id = (field: string) => `${partyId ?? "new"}-${kind}-${field}`;

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
          <Plus aria-hidden /> New {noun}
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${initial.name}` : `New ${noun}`}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {save.error && !Object.keys(errors).length && <Alert tone="error">{save.error.message}</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Code" htmlFor={id("code")} error={errors.code} required={!editing}>
              <Input id={id("code")} value={form.code} disabled={editing} onChange={(e) => set("code", e.target.value)} />
            </Field>
            <Field label="Name" htmlFor={id("name")} error={errors.name} required>
              <Input id={id("name")} value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="GSTIN" htmlFor={id("gstin")} error={errors.gstin}>
              <Input id={id("gstin")} value={form.gstin} maxLength={15} onChange={(e) => set("gstin", e.target.value)} />
            </Field>
            <Field label="Phone" htmlFor={id("phone")} error={errors.phone}>
              <Input id={id("phone")} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Email" htmlFor={id("email")} error={errors.email} className="sm:col-span-2">
              <Input id={id("email")} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Address" htmlFor={id("address")} error={errors.address} className="sm:col-span-2">
              <Textarea id={id("address")} value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
          </div>
          {editing && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
                className="size-4 rounded border-slate-300"
              />
              Active
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              {editing ? "Save changes" : `Create ${noun}`}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
