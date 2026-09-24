"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { emptyPricedLine, PricedLinesEditor, type PricedLine } from "@/components/shared/priced-lines-editor";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import type { NamedOption, SkuOption } from "@/lib/options";
import { pushFresh } from "@/lib/navigation";

export function InvoiceForm({ customers, skus, today }: { customers: NamedOption[]; skus: SkuOption[]; today: string }) {
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [header, setHeader] = useState({ customerId: "", invoiceDate: today, remarks: "" });
  const [lines, setLines] = useState<PricedLine[]>([emptyPricedLine()]);

  const save = useApiMutation(() =>
    apiRequest<{ id: string }>("/invoices", {
      body: {
        ...header,
        remarks: header.remarks || undefined,
        idempotencyKey,
        items: lines.map(({ skuId, quantity, uomId, rate, gstRate }) => ({
          skuId,
          quantity,
          uomId: uomId || undefined,
          rate: rate || undefined,
          gstRate: gstRate || undefined,
        })),
      },
    }),
  );
  const errors = save.fieldErrors;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const invoice = await save.mutate(undefined);
    if (invoice) {
      pushFresh(router, `/invoices/${invoice.id}`);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {save.error && !Object.keys(errors).length && <Alert tone="error">{save.error.message}</Alert>}

      <Card>
        <CardHeader title="Invoice details" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Customer" htmlFor="customerId" error={errors.customerId} required>
            <Select
              id="customerId"
              value={header.customerId}
              onChange={(e) => setHeader({ ...header, customerId: e.target.value })}
              aria-invalid={Boolean(errors.customerId)}
            >
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Invoice date" htmlFor="invoiceDate" error={errors.invoiceDate} required>
            <Input
              id="invoiceDate"
              type="date"
              value={header.invoiceDate}
              onChange={(e) => setHeader({ ...header, invoiceDate: e.target.value })}
            />
          </Field>
          <Field label="Remarks" htmlFor="remarks" error={errors.remarks} className="md:col-span-2">
            <Textarea
              id="remarks"
              value={header.remarks}
              maxLength={500}
              onChange={(e) => setHeader({ ...header, remarks: e.target.value })}
            />
          </Field>
        </CardBody>
      </Card>

      <PricedLinesEditor lines={lines} onChange={setLines} skus={skus} errors={errors} />

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={save.pending}>
          Create invoice
        </Button>
      </div>
    </form>
  );
}
