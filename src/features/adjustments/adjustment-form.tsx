"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/form-controls";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { AvailableBatchSelect } from "@/features/stock/available-batch-select";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { formatQuantity } from "@/lib/format";
import type { NamedOption, SkuOption } from "@/lib/options";
import { ADJUSTMENT_REASON_LABELS, ADJUSTMENT_REASONS, type AdjustmentReasonCode } from "@/lib/enums";
import { pushFresh } from "@/lib/navigation";

type Direction = "decrease" | "increase";

interface Line {
  key: string;
  skuId: string;
  direction: Direction;
  batchId: string;
  batchNumber: string;
  quantity: string;
}

const emptyLine = (): Line => ({
  key: crypto.randomUUID(),
  skuId: "",
  direction: "decrease",
  batchId: "",
  batchNumber: "",
  quantity: "",
});

/** Adjustment request. Stock changes only when another authorised user approves it. */
export function AdjustmentForm({
  godowns,
  skus,
  prefill,
}: {
  godowns: NamedOption[];
  skus: SkuOption[];
  /** Opened from a stock row ("Adjust" / "Write off"). */
  prefill?: { godownId: string; skuId: string; batchId: string; direction: Direction; quantity: string };
}) {
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [godownId, setGodownId] = useState(prefill?.godownId ?? godowns[0]?.id ?? "");
  const [reasonCode, setReasonCode] = useState<AdjustmentReasonCode>("DAMAGE");
  const [reasonNote, setReasonNote] = useState("");
  const [lines, setLines] = useState<Line[]>(() => [
    prefill
      ? { ...emptyLine(), skuId: prefill.skuId, batchId: prefill.batchId, direction: prefill.direction, quantity: prefill.quantity }
      : emptyLine(),
  ]);

  const submit = useApiMutation((body: unknown) => apiRequest<{ id: string }>("/adjustments", { body }));
  const errors = submit.fieldErrors;
  const skuById = new Map(skus.map((s) => [s.id, s]));

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const adjustment = await submit.mutate({
      godownId,
      reasonCode,
      reasonNote: reasonNote || undefined,
      idempotencyKey,
      items: lines.map((line) => {
        const quantity = line.quantity.trim();
        return line.direction === "decrease"
          ? { skuId: line.skuId, batchId: line.batchId || undefined, quantity: quantity ? `-${quantity}` : "" }
          : { skuId: line.skuId, batchNumber: line.batchNumber || undefined, quantity };
      }),
    });
    if (adjustment) {
      pushFresh(router, `/adjustments/${adjustment.id}`);
    }
  }

  const stockError = submit.error?.code === "INSUFFICIENT_STOCK" ? (submit.error.details as Record<string, string>) : null;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {submit.error && !Object.keys(errors).length && (
        <Alert tone="error" title={submit.error.message}>
          {stockError &&
            `${stockError.sku} batch ${stockError.batch}: available ${formatQuantity(stockError.available)}, requested ${formatQuantity(stockError.requested)}.`}
        </Alert>
      )}

      <Card>
        <CardHeader title="Request" description="Physical stock differs from system stock. A manager reviews every request." />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Godown" htmlFor="godownId" error={errors.godownId} required>
            <Select
              id="godownId"
              value={godownId}
              onChange={(e) => {
                setGodownId(e.target.value);
                setLines((current) => current.map((line) => ({ ...line, batchId: "" })));
              }}
            >
              {godowns.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reason" htmlFor="reasonCode" error={errors.reasonCode} required>
            <Select id="reasonCode" value={reasonCode} onChange={(e) => setReasonCode(e.target.value as AdjustmentReasonCode)}>
              {ADJUSTMENT_REASONS.map((code) => (
                <option key={code} value={code}>
                  {ADJUSTMENT_REASON_LABELS[code]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Notes"
            htmlFor="reasonNote"
            error={errors.reasonNote}
            required={reasonCode === "OTHER"}
            hint="What was found, where, and how it was verified."
            className="md:col-span-2"
          >
            <Textarea id="reasonNote" value={reasonNote} maxLength={500} onChange={(e) => setReasonNote(e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Lines"
          actions={
            <Button variant="secondary" size="sm" onClick={() => setLines([...lines, emptyLine()])}>
              <Plus aria-hidden /> Add line
            </Button>
          }
        />
        <Table>
          <THead>
            <tr>
              <TH className="w-1/4">SKU</TH>
              <TH>Change</TH>
              <TH className="w-1/3">Batch</TH>
              <TH>Quantity</TH>
              <TH className="sr-only">Remove</TH>
            </tr>
          </THead>
          <TBody>
            {lines.map((line, index) => {
              const sku = skuById.get(line.skuId);
              const err = (field: string) => errors[`items.${index}.${field}`];
              return (
                <tr key={line.key} className="align-top">
                  <TD>
                    <Select
                      aria-label={`SKU for line ${index + 1}`}
                      value={line.skuId}
                      onChange={(e) => updateLine(line.key, { skuId: e.target.value, batchId: "" })}
                      aria-invalid={Boolean(err("skuId"))}
                    >
                      <option value="">Select SKU</option>
                      {skus.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} · {s.name}
                        </option>
                      ))}
                    </Select>
                  </TD>
                  <TD>
                    <Select
                      aria-label={`Direction for line ${index + 1}`}
                      value={line.direction}
                      onChange={(e) => updateLine(line.key, { direction: e.target.value as Direction, batchId: "", batchNumber: "" })}
                      className="w-32"
                    >
                      <option value="decrease">Reduce</option>
                      <option value="increase">Increase</option>
                    </Select>
                  </TD>
                  <TD>
                    {line.direction === "decrease" ? (
                      <AvailableBatchSelect
                        label={`Batch for line ${index + 1}`}
                        skuId={line.skuId}
                        godownId={godownId}
                        value={line.batchId}
                        unit={sku?.unit}
                        invalid={Boolean(err("batchId"))}
                        onChange={(batchId) => updateLine(line.key, { batchId })}
                      />
                    ) : sku && !sku.isBatchTracked ? (
                      <span className="text-xs text-slate-400">Not batch-tracked</span>
                    ) : (
                      <Input
                        aria-label={`Batch number for line ${index + 1}`}
                        placeholder="Batch number (existing or new)"
                        value={line.batchNumber}
                        onChange={(e) => updateLine(line.key, { batchNumber: e.target.value })}
                        aria-invalid={Boolean(err("batchNumber"))}
                      />
                    )}
                    {(err("batchId") || err("batchNumber")) && (
                      <p className="mt-1 text-xs text-red-600">{err("batchId") ?? err("batchNumber")}</p>
                    )}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className={line.direction === "decrease" ? "text-red-700" : "text-emerald-700"} aria-hidden>
                        {line.direction === "decrease" ? "−" : "+"}
                      </span>
                      <Input
                        aria-label={`Quantity for line ${index + 1}`}
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value.replace(/^[-+]/, "") })}
                        className="w-28"
                        aria-invalid={Boolean(err("quantity"))}
                      />
                      <span className="text-xs text-slate-500">{sku?.unit}</span>
                    </div>
                    {err("quantity") && <p className="mt-1 text-xs text-red-600">{err("quantity")}</p>}
                  </TD>
                  <TD className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setLines(lines.filter((l) => l.key !== line.key))}
                      disabled={lines.length === 1}
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </TD>
                </tr>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={submit.pending}>
          Submit for approval
        </Button>
      </div>
    </form>
  );
}
