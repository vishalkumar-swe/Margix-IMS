"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import type { NamedOption, SkuOption } from "@/lib/options";

export interface ReorderRuleValues {
  skuId: string;
  godownId: string;
  reorderLevel: string;
  isActive: boolean;
}

export const EMPTY_RULE: ReorderRuleValues = { skuId: "", godownId: "", reorderLevel: "", isActive: true };

/** Creates or edits the reorder rule of a SKU × godown (the API upserts by that pair). */
export function ReorderRuleDialog({
  initial,
  skus,
  godowns,
  existing,
}: {
  initial: ReorderRuleValues;
  skus: SkuOption[];
  godowns: NamedOption[];
  /** Set when editing: the SKU × godown the rule belongs to (fixed). */
  existing?: { skuLabel: string; godownLabel: string; unit: string };
}) {
  const editing = Boolean(existing);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const save = useApiMutation((body: ReorderRuleValues) => apiRequest("/reorder-rules", { body }));
  const errors = save.fieldErrors;
  const unit = existing?.unit ?? skus.find((s) => s.id === form.skuId)?.unit;
  const id = (field: string) => `${editing ? `${initial.skuId}-${initial.godownId}` : "new"}-rule-${field}`;

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
          <Plus aria-hidden /> New rule
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit reorder rule" : "New reorder rule"}
        description="An alert is raised when the SKU's total stock in the godown reaches or falls below the level."
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {save.error && !Object.keys(errors).length && <Alert tone="error">{save.error.message}</Alert>}
          {existing ? (
            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              {existing.skuLabel} in {existing.godownLabel}
            </p>
          ) : (
            <>
              <Field label="SKU" htmlFor={id("sku")} error={errors.skuId} required>
                <Select id={id("sku")} value={form.skuId} onChange={(e) => setForm({ ...form, skuId: e.target.value })}>
                  <option value="">Select SKU</option>
                  {skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Godown" htmlFor={id("godown")} error={errors.godownId} required>
                <Select id={id("godown")} value={form.godownId} onChange={(e) => setForm({ ...form, godownId: e.target.value })}>
                  <option value="">Select godown</option>
                  {godowns.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.code})
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          <Field label="Reorder level" htmlFor={id("level")} error={errors.reorderLevel} required>
            <div className="flex items-center gap-2">
              <Input
                id={id("level")}
                inputMode="decimal"
                value={form.reorderLevel}
                onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
                className="w-36"
              />
              <span className="text-xs text-slate-500">{unit}</span>
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="size-4 rounded border-slate-300"
            />
            Active
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              Save rule
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
