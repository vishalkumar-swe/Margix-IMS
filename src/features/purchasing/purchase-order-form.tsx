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
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import type { NamedOption, SkuOption } from "@/lib/options";

interface Line {
  key: string;
  skuId: string;
  orderedQty: string;
  rate: string;
  gstRate: string;
}

export interface PurchaseOrderFormValues {
  supplierId: string;
  orderDate: string;
  expectedDate: string;
  remarks: string;
  items: Omit<Line, "key">[];
}

const emptyLine = (): Line => ({ key: crypto.randomUUID(), skuId: "", orderedQty: "", rate: "", gstRate: "" });

/** Create a PO (draft or open) or edit a draft (`purchaseOrderId` set). */
export function PurchaseOrderForm({
  suppliers,
  skus,
  initial,
  purchaseOrderId,
}: {
  suppliers: NamedOption[];
  skus: SkuOption[];
  initial: PurchaseOrderFormValues;
  purchaseOrderId?: string;
}) {
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [header, setHeader] = useState({
    supplierId: initial.supplierId,
    orderDate: initial.orderDate,
    expectedDate: initial.expectedDate,
    remarks: initial.remarks,
  });
  const [lines, setLines] = useState<Line[]>(() =>
    initial.items.length ? initial.items.map((item) => ({ ...item, key: crypto.randomUUID() })) : [emptyLine()],
  );
  const [intent, setIntent] = useState<"draft" | "open">("draft");

  const save = useApiMutation((submit: boolean) => {
    const body = {
      ...header,
      expectedDate: header.expectedDate || undefined,
      items: lines.map(({ skuId, orderedQty, rate, gstRate }) => ({
        skuId,
        orderedQty,
        rate: rate || undefined,
        gstRate: gstRate || undefined,
      })),
    };
    return purchaseOrderId
      ? apiRequest<{ id: string }>(`/purchase-orders/${purchaseOrderId}`, { method: "PATCH", body })
      : apiRequest<{ id: string }>("/purchase-orders", { body: { ...body, submit, idempotencyKey } });
  });
  const errors = save.fieldErrors;

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const nextIntent = submitter?.value === "open" ? "open" : "draft";
    setIntent(nextIntent);
    const po = await save.mutate(nextIntent === "open");
    if (po) {
      router.push(`/purchase-orders/${po.id}`);
      router.refresh();
    }
  }

  const skuById = new Map(skus.map((s) => [s.id, s]));

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {save.error && <Alert tone="error">{save.error.message}</Alert>}

      <Card>
        <CardHeader title="Order details" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Supplier" htmlFor="supplierId" error={errors.supplierId} required>
            <Select
              id="supplierId"
              value={header.supplierId}
              onChange={(e) => setHeader({ ...header, supplierId: e.target.value })}
              aria-invalid={Boolean(errors.supplierId)}
            >
              <option value="">Select supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Order date" htmlFor="orderDate" error={errors.orderDate} required>
            <Input
              id="orderDate"
              type="date"
              value={header.orderDate}
              onChange={(e) => setHeader({ ...header, orderDate: e.target.value })}
            />
          </Field>
          <Field label="Expected delivery" htmlFor="expectedDate" error={errors.expectedDate}>
            <Input
              id="expectedDate"
              type="date"
              value={header.expectedDate}
              onChange={(e) => setHeader({ ...header, expectedDate: e.target.value })}
            />
          </Field>
          <Field label="Remarks" htmlFor="remarks" error={errors.remarks} className="md:col-span-3">
            <Textarea
              id="remarks"
              value={header.remarks}
              maxLength={500}
              onChange={(e) => setHeader({ ...header, remarks: e.target.value })}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Items"
          description="One line per SKU."
          actions={
            <Button variant="secondary" size="sm" onClick={() => setLines([...lines, emptyLine()])}>
              <Plus aria-hidden /> Add line
            </Button>
          }
        />
        {errors.items && <p className="px-5 pt-3 text-sm text-red-600">{errors.items}</p>}
        <Table>
          <THead>
            <tr>
              <TH className="w-2/5">SKU</TH>
              <TH>Quantity</TH>
              <TH>Rate (₹)</TH>
              <TH>GST %</TH>
              <TH className="sr-only">Remove</TH>
            </tr>
          </THead>
          <TBody>
            {lines.map((line, index) => {
              const sku = skuById.get(line.skuId);
              const err = (field: string) => errors[`items.${index}.${field}`];
              return (
                <tr key={line.key}>
                  <TD>
                    <Select
                      aria-label={`SKU for line ${index + 1}`}
                      value={line.skuId}
                      onChange={(e) => updateLine(line.key, { skuId: e.target.value })}
                      aria-invalid={Boolean(err("skuId"))}
                    >
                      <option value="">Select SKU</option>
                      {skus.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} · {s.name}
                        </option>
                      ))}
                    </Select>
                    {err("skuId") && <p className="mt-1 text-xs text-red-600">{err("skuId")}</p>}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`Quantity for line ${index + 1}`}
                        inputMode="decimal"
                        value={line.orderedQty}
                        onChange={(e) => updateLine(line.key, { orderedQty: e.target.value })}
                        aria-invalid={Boolean(err("orderedQty"))}
                        className="w-28"
                      />
                      <span className="text-xs text-slate-500">{sku?.unit}</span>
                    </div>
                    {err("orderedQty") && <p className="mt-1 text-xs text-red-600">{err("orderedQty")}</p>}
                  </TD>
                  <TD>
                    <Input
                      aria-label={`Rate for line ${index + 1}`}
                      inputMode="decimal"
                      value={line.rate}
                      onChange={(e) => updateLine(line.key, { rate: e.target.value })}
                      aria-invalid={Boolean(err("rate"))}
                      className="w-28"
                    />
                    {err("rate") && <p className="mt-1 text-xs text-red-600">{err("rate")}</p>}
                  </TD>
                  <TD>
                    <Input
                      aria-label={`GST for line ${index + 1}`}
                      inputMode="decimal"
                      value={line.gstRate}
                      onChange={(e) => updateLine(line.key, { gstRate: e.target.value })}
                      aria-invalid={Boolean(err("gstRate"))}
                      className="w-20"
                    />
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
        <Button
          type="submit"
          value="draft"
          variant={purchaseOrderId ? "primary" : "secondary"}
          loading={save.pending && intent === "draft"}
          disabled={save.pending}
        >
          {purchaseOrderId ? "Save draft" : "Save as draft"}
        </Button>
        {!purchaseOrderId && (
          <Button type="submit" value="open" loading={save.pending && intent === "open"} disabled={save.pending}>
            Create & open
          </Button>
        )}
      </div>
    </form>
  );
}
