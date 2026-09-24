"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  emptyPricedLine,
  PricedLinesEditor,
  type OtherCharges,
  type PricedLine,
} from "@/components/shared/priced-lines-editor";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import type { PartyOption, SkuOption } from "@/lib/options";
import { pushFresh } from "@/lib/navigation";
import { resolveTaxType } from "@/lib/tax";

export interface PurchaseOrderFormValues {
  supplierId: string;
  orderDate: string;
  expectedDate: string;
  remarks: string;
  otherCharges: OtherCharges;
  items: Omit<PricedLine, "key">[];
}

const UNKNOWN_STATE_NOTE =
  "The GST state of the company or the supplier is not known, so it is treated as intra-state (set a GSTIN or state on the supplier).";

/** Create a PO (draft or open) or edit a draft (`purchaseOrderId` set). */
export function PurchaseOrderForm({
  suppliers,
  skus,
  initial,
  purchaseOrderId,
  companyStateCode,
}: {
  suppliers: PartyOption[];
  skus: SkuOption[];
  initial: PurchaseOrderFormValues;
  purchaseOrderId?: string;
  /** Our GST state; with the supplier's it decides CGST + SGST vs IGST. */
  companyStateCode: string | null;
}) {
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [header, setHeader] = useState({
    supplierId: initial.supplierId,
    orderDate: initial.orderDate,
    expectedDate: initial.expectedDate,
    remarks: initial.remarks,
  });
  const [lines, setLines] = useState<PricedLine[]>(() =>
    initial.items.length ? initial.items.map((item) => ({ ...item, key: crypto.randomUUID() })) : [emptyPricedLine()],
  );
  const [otherCharges, setOtherCharges] = useState<OtherCharges>(initial.otherCharges);
  const [intent, setIntent] = useState<"draft" | "open">("draft");
  const supplier = suppliers.find((s) => s.id === header.supplierId);
  const { taxType, statesKnown } = resolveTaxType(companyStateCode, supplier?.stateCode);

  const save = useApiMutation((submit: boolean) => {
    const body = {
      ...header,
      expectedDate: header.expectedDate || undefined,
      otherCharges: otherCharges.amount || undefined,
      otherChargesLabel: otherCharges.label || undefined,
      items: lines.map(({ skuId, quantity, uomId, rate, discountPercent, gstRate }) => ({
        skuId,
        orderedQty: quantity,
        uomId: uomId || undefined,
        rate: rate || undefined,
        discountPercent: discountPercent || undefined,
        gstRate: gstRate || undefined,
      })),
    };
    return purchaseOrderId
      ? apiRequest<{ id: string }>(`/purchase-orders/${purchaseOrderId}`, { method: "PATCH", body })
      : apiRequest<{ id: string }>("/purchase-orders", { body: { ...body, submit, idempotencyKey } });
  });
  const errors = save.fieldErrors;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const nextIntent = submitter?.value === "open" ? "open" : "draft";
    setIntent(nextIntent);
    const po = await save.mutate(nextIntent === "open");
    if (po) {
      pushFresh(router, `/purchase-orders/${po.id}`);
    }
  }

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

      <PricedLinesEditor
        lines={lines}
        onChange={setLines}
        skus={skus}
        errors={errors}
        quantityField="orderedQty"
        taxType={taxType}
        taxNote={supplier && !statesKnown ? UNKNOWN_STATE_NOTE : undefined}
        otherCharges={otherCharges}
        onOtherChargesChange={setOtherCharges}
      />

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
