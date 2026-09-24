"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { GST_STATES, gstStateLabel, stateCodeOfGstin } from "@/lib/gst-states";

export interface PartyFormValues {
  code: string;
  name: string;
  gstin: string;
  /** GST state code; taken from the GSTIN when there is one. */
  stateCode: string;
  email: string;
  phone: string;
  address: string;
  isActive: boolean;
}

export const EMPTY_PARTY: PartyFormValues = {
  code: "",
  name: "",
  gstin: "",
  stateCode: "",
  email: "",
  phone: "",
  address: "",
  isActive: true,
};

/** Supplier or customer create/edit (same fields, different endpoint). */
export function PartyFormDialog({
  kind,
  partyId,
  initial,
  nextCode,
}: {
  kind: "supplier" | "customer";
  partyId?: string;
  initial: PartyFormValues;
  /** Code the next new party gets when left blank (from the numbering master). */
  nextCode?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const editing = Boolean(partyId);
  const endpoint = kind === "supplier" ? "/suppliers" : "/customers";
  const noun = kind === "supplier" ? "supplier" : "customer";

  // A GSTIN names its state; the state field is only needed without one.
  const gstinState = stateCodeOfGstin(form.gstin);
  const save = useApiMutation(({ code, isActive, ...rest }: PartyFormValues) => {
    const body = { ...rest, stateCode: stateCodeOfGstin(rest.gstin) ?? rest.stateCode };
    return editing
      ? apiRequest(`${endpoint}/${partyId}`, { method: "PATCH", body: { ...body, isActive } })
      : apiRequest(endpoint, { body: { ...body, code } });
  });
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
            <Field
              label="Code"
              htmlFor={id("code")}
              error={errors.code}
              hint={editing ? undefined : nextCode ? `Leave blank to use ${nextCode}.` : "Leave blank for the next code."}
            >
              <Input
                id={id("code")}
                value={form.code}
                disabled={editing}
                placeholder={editing ? undefined : nextCode}
                onChange={(e) => set("code", e.target.value)}
              />
            </Field>
            <Field label="Name" htmlFor={id("name")} error={errors.name} required>
              <Input id={id("name")} value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="GSTIN" htmlFor={id("gstin")} error={errors.gstin}>
              <Input id={id("gstin")} value={form.gstin} maxLength={15} onChange={(e) => set("gstin", e.target.value)} />
            </Field>
            <Field
              label="GST state"
              htmlFor={id("state")}
              error={errors.stateCode}
              hint={gstinState ? "From the GSTIN." : "Decides CGST + SGST or IGST on documents."}
            >
              <Select
                id={id("state")}
                value={gstinState ?? form.stateCode}
                disabled={Boolean(gstinState)}
                onChange={(e) => set("stateCode", e.target.value)}
              >
                <option value="">Not set</option>
                {GST_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {gstStateLabel(s.code)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Phone" htmlFor={id("phone")} error={errors.phone}>
              <Input id={id("phone")} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Email" htmlFor={id("email")} error={errors.email}>
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
