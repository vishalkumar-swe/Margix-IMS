"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/form-controls";
import { BatchLinesEditor, emptyBatchLine, type BatchLine } from "@/features/stock/batch-lines-editor";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { formatQuantity } from "@/lib/format";
import type { NamedOption, SkuOption } from "@/lib/options";
import { pushFresh } from "@/lib/navigation";

/** An invoice that can still be dispatched against, with remaining quantity per SKU. */
export interface DispatchableInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  remainingBySku: Record<string, string>;
}

export function DispatchForm({
  godowns,
  customers,
  skus,
  invoices,
  initialInvoiceId,
}: {
  godowns: NamedOption[];
  customers: NamedOption[];
  skus: SkuOption[];
  invoices: DispatchableInvoice[];
  initialInvoiceId?: string;
}) {
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const initialInvoice = invoices.find((i) => i.id === initialInvoiceId);
  const [header, setHeader] = useState({
    godownId: godowns[0]?.id ?? "",
    invoiceId: initialInvoice?.id ?? "",
    customerId: initialInvoice?.customerId ?? "",
    vehicleNo: "",
    referenceNo: "",
    remarks: "",
  });
  const [lines, setLines] = useState<BatchLine[]>([emptyBatchLine()]);

  const post = useApiMutation((body: unknown) => apiRequest<{ id: string }>("/dispatches", { body }));
  const errors = post.fieldErrors;
  const invoice = invoices.find((i) => i.id === header.invoiceId);
  // With an invoice, only its SKUs that still have quantity remaining can be dispatched.
  const selectableSkus = invoice ? skus.filter((s) => invoice.remainingBySku[s.id] !== undefined) : skus;

  function changeInvoice(invoiceId: string) {
    const next = invoices.find((i) => i.id === invoiceId);
    setHeader({ ...header, invoiceId, customerId: next?.customerId ?? header.customerId });
    if (!next) return;
    // Keep only lines whose SKU is on the chosen invoice.
    setLines((current) => {
      const kept = current.filter((l) => l.skuId && next.remainingBySku[l.skuId] !== undefined);
      return kept.length > 0 ? kept : [emptyBatchLine()];
    });
  }

  function changeGodown(godownId: string) {
    setHeader({ ...header, godownId });
    // Batches are godown-specific, so selections no longer apply.
    setLines((current) => current.map((line) => ({ ...line, batchId: "", available: null })));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const outward = await post.mutate({
      godownId: header.godownId,
      invoiceId: header.invoiceId || undefined,
      customerId: header.customerId || undefined,
      vehicleNo: header.vehicleNo || undefined,
      referenceNo: header.referenceNo || undefined,
      remarks: header.remarks || undefined,
      idempotencyKey,
      items: lines.map(({ skuId, batchId, quantity }) => ({ skuId, batchId, quantity })),
    });
    if (outward) {
      pushFresh(router, `/dispatches/${outward.id}`);
    }
  }

  const stockError = post.error?.code === "INSUFFICIENT_STOCK" ? (post.error.details as Record<string, string>) : null;
  const invoiceError = post.error?.code === "OVER_DISPATCH" ? (post.error.details as Record<string, string>) : null;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {post.error && !Object.keys(errors).length && (
        <Alert tone="error" title={post.error.message}>
          {stockError &&
            `${stockError.sku} batch ${stockError.batch} in ${stockError.godown}: available ${formatQuantity(stockError.available)}, requested ${formatQuantity(stockError.requested)}.`}
          {invoiceError &&
            `${invoiceError.invoice}: ${formatQuantity(invoiceError.remaining)} remaining, dispatching ${formatQuantity(invoiceError.dispatching)}.`}
        </Alert>
      )}

      <Card>
        <CardHeader title="Dispatch details" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="From godown" htmlFor="godownId" error={errors.godownId} required>
            <Select id="godownId" value={header.godownId} onChange={(e) => changeGodown(e.target.value)}>
              {godowns.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Against invoice"
            htmlFor="invoiceId"
            error={errors.invoiceId}
            hint="Optional. Books the quantities against the invoice."
          >
            <Select id="invoiceId" value={header.invoiceId} onChange={(e) => changeInvoice(e.target.value)}>
              <option value="">No invoice</option>
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.invoiceNumber} · {i.customerName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Customer" htmlFor="customerId" error={errors.customerId}>
            <Select
              id="customerId"
              value={header.customerId}
              disabled={Boolean(invoice)}
              onChange={(e) => setHeader({ ...header, customerId: e.target.value })}
            >
              <option value="">No customer (internal issue)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference (invoice / challan no.)" htmlFor="referenceNo" error={errors.referenceNo}>
            <Input id="referenceNo" value={header.referenceNo} onChange={(e) => setHeader({ ...header, referenceNo: e.target.value })} />
          </Field>
          <Field label="Vehicle no." htmlFor="vehicleNo" error={errors.vehicleNo}>
            <Input id="vehicleNo" value={header.vehicleNo} onChange={(e) => setHeader({ ...header, vehicleNo: e.target.value })} />
          </Field>
          <Field label="Remarks" htmlFor="remarks" error={errors.remarks}>
            <Textarea id="remarks" value={header.remarks} maxLength={500} onChange={(e) => setHeader({ ...header, remarks: e.target.value })} />
          </Field>
        </CardBody>
      </Card>

      <BatchLinesEditor
        description="Pick the batch to dispatch; dispatch beyond available batch stock is blocked."
        lines={lines}
        onChange={setLines}
        skus={selectableSkus}
        godownId={header.godownId}
        errors={errors}
        lineHint={(line) =>
          invoice && line.skuId && invoice.remainingBySku[line.skuId] ? (
            <p className="mt-1 text-xs text-slate-500">
              Remaining on invoice {formatQuantity(invoice.remainingBySku[line.skuId])}
            </p>
          ) : null
        }
      />

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={post.pending}>
          Post dispatch
        </Button>
      </div>
    </form>
  );
}
