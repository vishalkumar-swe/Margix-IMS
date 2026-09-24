"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";

export interface OpeningLineValues {
  quantity: string;
  batchNumber: string;
  manufacturingDate: string;
  expiryDate: string;
}

/**
 * Edit a posted opening line. Saving posts the corrected line (a new opening
 * document linked to this one) and reverses this line, in one step.
 */
export function OpeningLineEditDialog({
  itemId,
  label,
  unit,
  isBatchTracked,
  initial,
}: {
  itemId: string;
  /** e.g. "RM-001 · B-100 · OPN-2026-000001" */
  label: string;
  unit: string;
  isBatchTracked: boolean;
  initial: OpeningLineValues;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...initial, reason: "" });
  const save = useApiMutation((body: typeof form) =>
    apiRequest<{ openingNumber: string }>(`/opening-balances/lines/${itemId}/correct`, {
      body: {
        quantity: body.quantity,
        batchNumber: isBatchTracked ? body.batchNumber : undefined,
        manufacturingDate: body.manufacturingDate || undefined,
        expiryDate: body.expiryDate || undefined,
        reason: body.reason,
      },
    }),
  );
  const errors = save.fieldErrors;
  const set = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value });
  const id = (field: string) => `opening-${itemId}-${field}`;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (await save.mutate(form)) {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setForm({ ...initial, reason: "" });
          save.reset();
          setOpen(true);
        }}
      >
        <Pencil aria-hidden /> Edit
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Correct opening stock"
        description={`${label}. The corrected line is posted as a new opening document and this line is reversed; both stay in the history.`}
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {save.error && !Object.keys(errors).length && <Alert tone="error">{save.error.message}</Alert>}
          <div className="grid grid-cols-2 gap-4">
            <Field label={`Quantity (${unit})`} htmlFor={id("qty")} error={errors.quantity} required>
              <Input id={id("qty")} inputMode="decimal" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
            </Field>
            {isBatchTracked && (
              <Field label="Batch" htmlFor={id("batch")} error={errors.batchNumber} required>
                <Input id={id("batch")} value={form.batchNumber} onChange={(e) => set("batchNumber", e.target.value)} />
              </Field>
            )}
            {isBatchTracked && (
              <Field label="Manufactured" htmlFor={id("mfg")} error={errors.manufacturingDate}>
                <Input id={id("mfg")} type="date" value={form.manufacturingDate} onChange={(e) => set("manufacturingDate", e.target.value)} />
              </Field>
            )}
            {isBatchTracked && (
              <Field label="Expiry" htmlFor={id("exp")} error={errors.expiryDate}>
                <Input id={id("exp")} type="date" value={form.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} />
              </Field>
            )}
          </div>
          <Field label="Reason for the correction" htmlFor={id("reason")} error={errors.reason} required>
            <Textarea id={id("reason")} value={form.reason} onChange={(e) => set("reason", e.target.value)} placeholder="e.g. Physical count at go-live was 450, not 500" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              Save correction
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
