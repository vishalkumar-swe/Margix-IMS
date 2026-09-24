"use client";

import { Ruler, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";

export interface SkuUnitRow {
  uomId: string;
  code: string;
  factor: string;
}

/**
 * Alternate purchase/sales units of a SKU (e.g. 1 BOX = 24 PCS). Stock is
 * always kept in the base unit; these only change how quantities are entered.
 */
export function SkuUnitsDialog({
  skuId,
  skuCode,
  baseUom,
  units,
  uoms,
}: {
  skuId: string;
  skuCode: string;
  baseUom: { id: string; code: string };
  units: SkuUnitRow[];
  uoms: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ uomId: "", factor: "" });

  const save = useApiMutation((values: typeof form) => apiRequest(`/skus/${skuId}/units`, { body: values }));
  const remove = useApiMutation((uomId: string) => apiRequest(`/skus/${skuId}/units/${uomId}`, { method: "DELETE" }));
  const errors = save.fieldErrors;
  const choices = uoms.filter((u) => u.id !== baseUom.id);
  const id = (field: string) => `${skuId}-unit-${field}`;

  function openDialog() {
    setForm({ uomId: "", factor: "" });
    save.reset();
    remove.reset();
    setOpen(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (await save.mutate(form)) {
      setForm({ uomId: "", factor: "" });
      router.refresh();
    }
  }

  async function onRemove(uomId: string) {
    if (await remove.mutate(uomId)) router.refresh();
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={openDialog}>
        <Ruler aria-hidden /> Units{units.length > 0 && ` (${units.length})`}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Units of ${skuCode}`}
        description={`Stock is kept in ${baseUom.code}. Purchase orders and invoices can also be entered in these units.`}
        className="max-w-lg"
      >
        <div className="space-y-4">
          {remove.error && <Alert tone="error">{remove.error.message}</Alert>}
          {units.length > 0 ? (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {units.map((u) => (
                <li key={u.uomId} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    1 <span className="font-medium">{u.code}</span> = {u.factor} {baseUom.code}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(u.uomId)}
                    disabled={remove.pending}
                    aria-label={`Remove unit ${u.code}`}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No alternate units yet.</p>
          )}

          <form onSubmit={onSubmit} className="space-y-3" noValidate>
            {save.error && !Object.keys(errors).length && <Alert tone="error">{save.error.message}</Alert>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unit" htmlFor={id("uom")} error={errors.uomId} required>
                <Select id={id("uom")} value={form.uomId} onChange={(e) => setForm({ ...form, uomId: e.target.value })}>
                  <option value="">Select unit</option>
                  {choices.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code} · {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={`${baseUom.code} per unit`} htmlFor={id("factor")} error={errors.factor} required>
                <Input
                  id={id("factor")}
                  inputMode="decimal"
                  value={form.factor}
                  onChange={(e) => setForm({ ...form, factor: e.target.value })}
                />
              </Field>
            </div>
            <p className="text-xs text-slate-500">Saving an existing unit updates its factor; past documents keep theirs.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button type="submit" loading={save.pending}>
                Save unit
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
    </>
  );
}
