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

interface Line {
  key: string;
  skuId: string;
  batchId: string;
  available: string | null;
  quantity: string;
}

const emptyLine = (): Line => ({ key: crypto.randomUUID(), skuId: "", batchId: "", available: null, quantity: "" });

export function DispatchForm({
  godowns,
  customers,
  skus,
}: {
  godowns: NamedOption[];
  customers: NamedOption[];
  skus: SkuOption[];
}) {
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [header, setHeader] = useState({
    godownId: godowns[0]?.id ?? "",
    customerId: "",
    vehicleNo: "",
    referenceNo: "",
    remarks: "",
  });
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const post = useApiMutation((body: unknown) => apiRequest<{ id: string }>("/dispatches", { body }));
  const errors = post.fieldErrors;
  const skuById = new Map(skus.map((s) => [s.id, s]));

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
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
      customerId: header.customerId || undefined,
      vehicleNo: header.vehicleNo || undefined,
      referenceNo: header.referenceNo || undefined,
      remarks: header.remarks || undefined,
      idempotencyKey,
      items: lines.map(({ skuId, batchId, quantity }) => ({ skuId, batchId, quantity })),
    });
    if (outward) {
      router.push(`/dispatches/${outward.id}`);
      router.refresh();
    }
  }

  const stockError = post.error?.code === "INSUFFICIENT_STOCK" ? (post.error.details as Record<string, string>) : null;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {post.error && !Object.keys(errors).length && (
        <Alert tone="error" title={post.error.message}>
          {stockError &&
            `${stockError.sku} batch ${stockError.batch} in ${stockError.godown}: available ${formatQuantity(stockError.available)}, requested ${formatQuantity(stockError.requested)}.`}
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
          <Field label="Customer" htmlFor="customerId" error={errors.customerId}>
            <Select id="customerId" value={header.customerId} onChange={(e) => setHeader({ ...header, customerId: e.target.value })}>
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
          <Field label="Remarks" htmlFor="remarks" error={errors.remarks} className="md:col-span-2">
            <Textarea id="remarks" value={header.remarks} maxLength={500} onChange={(e) => setHeader({ ...header, remarks: e.target.value })} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Items"
          description="Pick the batch to dispatch; dispatch beyond available batch stock is blocked."
          actions={
            <Button variant="secondary" size="sm" onClick={() => setLines([...lines, emptyLine()])}>
              <Plus aria-hidden /> Add line
            </Button>
          }
        />
        <Table>
          <THead>
            <tr>
              <TH className="w-1/3">SKU</TH>
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
                      onChange={(e) => updateLine(line.key, { skuId: e.target.value, batchId: "", available: null })}
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
                    <AvailableBatchSelect
                      label={`Batch for line ${index + 1}`}
                      skuId={line.skuId}
                      godownId={header.godownId}
                      value={line.batchId}
                      unit={sku?.unit}
                      invalid={Boolean(err("batchId"))}
                      onChange={(batchId, available) => updateLine(line.key, { batchId, available })}
                    />
                    {err("batchId") && <p className="mt-1 text-xs text-red-600">{err("batchId")}</p>}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`Quantity for line ${index + 1}`}
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        className="w-28"
                        aria-invalid={Boolean(err("quantity"))}
                      />
                      <span className="text-xs text-slate-500">{sku?.unit}</span>
                    </div>
                    {line.available && <p className="mt-1 text-xs text-slate-500">Available {formatQuantity(line.available)}</p>}
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
        <Button type="submit" loading={post.pending}>
          Post dispatch
        </Button>
      </div>
    </form>
  );
}
