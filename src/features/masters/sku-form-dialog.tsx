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
import { humanize } from "@/lib/format";
import { SKU_STATUSES } from "@/lib/enums";

export interface SkuFormValues {
  code: string;
  name: string;
  description: string;
  categoryId: string;
  baseUomId: string;
  hsnCode: string;
  gstRate: string;
  isBatchTracked: boolean;
  tallyStockItemName: string;
  status: (typeof SKU_STATUSES)[number];
}

export const EMPTY_SKU: SkuFormValues = {
  code: "",
  name: "",
  description: "",
  categoryId: "",
  baseUomId: "",
  hsnCode: "",
  gstRate: "",
  isBatchTracked: true,
  tallyStockItemName: "",
  status: "ACTIVE",
};

/** Create (no `skuId`) or edit an SKU. Code is immutable after creation. */
export function SkuFormDialog({
  skuId,
  initial,
  categories,
  uoms,
}: {
  skuId?: string;
  initial: SkuFormValues;
  categories: { id: string; name: string }[];
  uoms: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const editing = Boolean(skuId);

  const save = useApiMutation((values: SkuFormValues) => {
    const { code, status, ...common } = values;
    return editing
      ? apiRequest(`/skus/${skuId}`, { method: "PATCH", body: { ...common, status } })
      : apiRequest("/skus", {
          body: {
            ...common,
            code,
            categoryId: common.categoryId || undefined,
            gstRate: common.gstRate || undefined,
          },
        });
  });
  const errors = save.fieldErrors;

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

  const set = <K extends keyof SkuFormValues>(key: K, value: SkuFormValues[K]) => setForm({ ...form, [key]: value });
  const id = (field: string) => `${skuId ?? "new"}-sku-${field}`;

  return (
    <>
      {editing ? (
        <Button variant="ghost" size="sm" onClick={openDialog}>
          <Pencil aria-hidden /> Edit
        </Button>
      ) : (
        <Button onClick={openDialog}>
          <Plus aria-hidden /> New SKU
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${initial.code}` : "New SKU"} className="max-w-2xl">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {save.error && !Object.keys(errors).length && <Alert tone="error">{save.error.message}</Alert>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Code" htmlFor={id("code")} error={errors.code} required={!editing}>
              <Input id={id("code")} value={form.code} disabled={editing} onChange={(e) => set("code", e.target.value)} />
            </Field>
            <Field label="Name" htmlFor={id("name")} error={errors.name} required>
              <Input id={id("name")} value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Category" htmlFor={id("category")} error={errors.categoryId}>
              <Select id={id("category")} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unit" htmlFor={id("uom")} error={errors.baseUomId} required hint="Cannot change once stock has moved.">
              <Select id={id("uom")} value={form.baseUomId} onChange={(e) => set("baseUomId", e.target.value)}>
                <option value="">Select unit</option>
                {uoms.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} · {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="HSN code" htmlFor={id("hsn")} error={errors.hsnCode}>
              <Input id={id("hsn")} value={form.hsnCode} onChange={(e) => set("hsnCode", e.target.value)} />
            </Field>
            <Field label="GST %" htmlFor={id("gst")} error={errors.gstRate}>
              <Input id={id("gst")} inputMode="decimal" value={form.gstRate} onChange={(e) => set("gstRate", e.target.value)} />
            </Field>
            <Field label="Tally stock item name" htmlFor={id("tally")} error={errors.tallyStockItemName} hint="Required for Tally sync.">
              <Input id={id("tally")} value={form.tallyStockItemName} onChange={(e) => set("tallyStockItemName", e.target.value)} />
            </Field>
            {editing && (
              <Field label="Status" htmlFor={id("status")} error={errors.status}>
                <Select id={id("status")} value={form.status} onChange={(e) => set("status", e.target.value as SkuFormValues["status"])}>
                  {SKU_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Description" htmlFor={id("description")} error={errors.description} className="md:col-span-2">
              <Textarea id={id("description")} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
              <input
                type="checkbox"
                checked={form.isBatchTracked}
                onChange={(e) => set("isBatchTracked", e.target.checked)}
                className="size-4 rounded border-slate-300"
              />
              Track stock by batch / lot (expiry, manufacturing date)
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              {editing ? "Save changes" : "Create SKU"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
