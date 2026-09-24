"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/form-controls";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { formatQuantity } from "@/lib/format";
import type { NamedOption, SkuOption } from "@/lib/options";

export interface ReceivableLine {
  purchaseOrderItemId: string;
  sku: SkuOption;
  ordered: string;
  received: string;
  pending: string;
}

interface LineInput {
  batchNumber: string;
  manufacturingDate: string;
  expiryDate: string;
  receivedQty: string;
  acceptedQty: string;
  rejectionReason: string;
}

const emptyInput: LineInput = {
  batchNumber: "",
  manufacturingDate: "",
  expiryDate: "",
  receivedQty: "",
  acceptedQty: "",
  rejectionReason: "",
};

/** Posts a GRN against a purchase order: physical receipt, with accepted vs rejected quantity. */
export function ReceiveGoodsForm({
  purchaseOrderId,
  godowns,
  lines,
}: {
  purchaseOrderId: string;
  godowns: NamedOption[];
  lines: ReceivableLine[];
}) {
  const router = useRouter();
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [godownId, setGodownId] = useState(godowns[0]?.id ?? "");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [inputs, setInputs] = useState<Record<string, LineInput>>({});
  const [clientError, setClientError] = useState<string | null>(null);
  const [posted, setPosted] = useState<string | null>(null);

  const post = useApiMutation((body: unknown) =>
    apiRequest<{ grnNumber: string }>(`/purchase-orders/${purchaseOrderId}/grns`, { body }),
  );

  const inputFor = (id: string) => inputs[id] ?? emptyInput;

  function update(id: string, patch: Partial<LineInput>) {
    setInputs((current) => {
      const previous = current[id] ?? emptyInput;
      const next = { ...previous, ...patch };
      // Accepted follows received until the user changes it explicitly.
      if (patch.receivedQty !== undefined && previous.acceptedQty === previous.receivedQty) {
        next.acceptedQty = patch.receivedQty;
      }
      return { ...current, [id]: next };
    });
  }

  const submitted = lines.filter((line) => inputFor(line.purchaseOrderItemId).receivedQty.trim() !== "");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setClientError(null);
    setPosted(null);
    if (submitted.length === 0) {
      setClientError("Enter the received quantity for at least one item.");
      return;
    }

    const result = await post.mutate({
      godownId,
      supplierInvoiceNo: supplierInvoiceNo || undefined,
      idempotencyKey,
      items: submitted.map((line) => {
        const input = inputFor(line.purchaseOrderItemId);
        return {
          purchaseOrderItemId: line.purchaseOrderItemId,
          batchNumber: line.sku.isBatchTracked ? input.batchNumber || undefined : undefined,
          manufacturingDate: input.manufacturingDate || undefined,
          expiryDate: input.expiryDate || undefined,
          receivedQty: input.receivedQty,
          acceptedQty: input.acceptedQty,
          rejectionReason: input.rejectionReason || undefined,
        };
      }),
    });
    if (result) {
      setPosted(result.grnNumber);
      setInputs({});
      setSupplierInvoiceNo("");
      setIdempotencyKey(crypto.randomUUID());
      router.refresh();
    }
  }

  const errorFor = (lineId: string, field: string) => {
    const index = submitted.findIndex((line) => line.purchaseOrderItemId === lineId);
    return index >= 0 ? post.fieldErrors[`items.${index}.${field}`] : undefined;
  };

  return (
    <Card>
      <CardHeader title="Receive goods" description="Only the accepted quantity is added to stock." />
      <form onSubmit={onSubmit} noValidate>
        <CardBody className="space-y-4">
          {posted && <Alert tone="success">{posted} posted. Stock has been updated.</Alert>}
          {(clientError || (post.error && !Object.keys(post.fieldErrors).length)) && (
            <Alert tone="error" title={clientError ?? post.error?.message}>
              {post.error?.code === "OVER_RECEIPT" && "Reduce the accepted quantity to the pending quantity."}
            </Alert>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Receiving godown" htmlFor="grn-godown" error={post.fieldErrors.godownId} required>
              <Select id="grn-godown" value={godownId} onChange={(e) => setGodownId(e.target.value)}>
                {godowns.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Supplier invoice no." htmlFor="grn-invoice" error={post.fieldErrors.supplierInvoiceNo}>
              <Input id="grn-invoice" value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} />
            </Field>
          </div>
        </CardBody>

        <Table>
          <THead>
            <tr>
              <TH>SKU</TH>
              <TH numeric>Pending</TH>
              <TH>Batch</TH>
              <TH>Mfg / expiry</TH>
              <TH>Received</TH>
              <TH>Accepted</TH>
              <TH>Rejection reason</TH>
            </tr>
          </THead>
          <TBody>
            {lines.map((line) => {
              const id = line.purchaseOrderItemId;
              const input = inputFor(id);
              const rejecting = input.receivedQty !== "" && input.acceptedQty !== input.receivedQty;
              return (
                <tr key={id} className="align-top">
                  <TD>
                    <span className="font-medium text-slate-900">{line.sku.code}</span>
                    <span className="block text-xs text-slate-500">{line.sku.name}</span>
                  </TD>
                  <TD numeric>
                    {formatQuantity(line.pending)} <span className="text-xs text-slate-400">{line.sku.unit}</span>
                  </TD>
                  <TD>
                    {line.sku.isBatchTracked ? (
                      <Input
                        aria-label={`Batch for ${line.sku.code}`}
                        value={input.batchNumber}
                        onChange={(e) => update(id, { batchNumber: e.target.value })}
                        className="w-32"
                        aria-invalid={Boolean(errorFor(id, "batchNumber"))}
                      />
                    ) : (
                      <span className="text-xs text-slate-400">Not tracked</span>
                    )}
                    {errorFor(id, "batchNumber") && <p className="mt-1 text-xs text-red-600">{errorFor(id, "batchNumber")}</p>}
                  </TD>
                  <TD>
                    {line.sku.isBatchTracked && (
                      <div className="flex flex-col gap-1">
                        <Input
                          type="date"
                          aria-label={`Manufacturing date for ${line.sku.code}`}
                          value={input.manufacturingDate}
                          onChange={(e) => update(id, { manufacturingDate: e.target.value })}
                          className="w-40"
                        />
                        <Input
                          type="date"
                          aria-label={`Expiry date for ${line.sku.code}`}
                          value={input.expiryDate}
                          onChange={(e) => update(id, { expiryDate: e.target.value })}
                          className="w-40"
                          aria-invalid={Boolean(errorFor(id, "expiryDate"))}
                        />
                        {errorFor(id, "expiryDate") && <p className="text-xs text-red-600">{errorFor(id, "expiryDate")}</p>}
                      </div>
                    )}
                  </TD>
                  <TD>
                    <Input
                      aria-label={`Received quantity for ${line.sku.code}`}
                      inputMode="decimal"
                      value={input.receivedQty}
                      onChange={(e) => update(id, { receivedQty: e.target.value })}
                      className="w-24"
                      aria-invalid={Boolean(errorFor(id, "receivedQty"))}
                    />
                    {errorFor(id, "receivedQty") && <p className="mt-1 text-xs text-red-600">{errorFor(id, "receivedQty")}</p>}
                  </TD>
                  <TD>
                    <Input
                      aria-label={`Accepted quantity for ${line.sku.code}`}
                      inputMode="decimal"
                      value={input.acceptedQty}
                      onChange={(e) => update(id, { acceptedQty: e.target.value })}
                      className="w-24"
                      aria-invalid={Boolean(errorFor(id, "acceptedQty"))}
                    />
                    {errorFor(id, "acceptedQty") && <p className="mt-1 text-xs text-red-600">{errorFor(id, "acceptedQty")}</p>}
                  </TD>
                  <TD>
                    {rejecting && (
                      <Input
                        aria-label={`Rejection reason for ${line.sku.code}`}
                        value={input.rejectionReason}
                        onChange={(e) => update(id, { rejectionReason: e.target.value })}
                        className="w-44"
                        aria-invalid={Boolean(errorFor(id, "rejectionReason"))}
                      />
                    )}
                    {errorFor(id, "rejectionReason") && (
                      <p className="mt-1 text-xs text-red-600">{errorFor(id, "rejectionReason")}</p>
                    )}
                  </TD>
                </tr>
              );
            })}
          </TBody>
        </Table>

        <div className="flex justify-end border-t border-slate-200 px-5 py-4">
          <Button type="submit" loading={post.pending}>
            Post GRN
          </Button>
        </div>
      </form>
    </Card>
  );
}
