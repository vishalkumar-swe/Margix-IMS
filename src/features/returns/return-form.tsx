"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/form-controls";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { ScanInput, type ScanStatus } from "@/features/scan/scan-input";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { formatQuantity } from "@/lib/format";
import { formatScaled, parseScaled } from "@/lib/tax";
import type { NamedOption } from "@/lib/options";
import { pushFresh } from "@/lib/navigation";

export interface ReturnableLine {
  id: string;
  skuCode: string;
  skuBarcode: string | null;
  skuName: string;
  unit: string;
  batchNumber: string;
  returnable: string;
}

/** Shared by customer returns (against a dispatch) and supplier returns (against a GRN). */
export interface ReturnFormConfig {
  endpoint: "/sales-returns" | "/purchase-returns";
  sourceField: "outwardId" | "grnId";
  lineField: "outwardItemId" | "grnItemId";
  godownLabel: string;
  submitLabel: string;
}

/** Exact decimal arithmetic on quantity strings (3 decimal places). */
const toThousandths = (value: string) => parseScaled(value, 3) ?? 0n;
const fromThousandths = (value: bigint) => formatScaled(value, 3).replace(/\.?0+$/, "");

export function ReturnForm({
  config,
  sourceId,
  sourceNumber,
  lines,
  godowns,
  defaultGodownId,
}: {
  config: ReturnFormConfig;
  sourceId: string;
  /** Number of the dispatch / GRN being returned against (for messages). */
  sourceNumber: string;
  lines: ReturnableLine[];
  godowns: NamedOption[];
  defaultGodownId: string;
}) {
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [godownId, setGodownId] = useState(defaultGodownId);
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [clientError, setClientError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);

  /** A scanned product adds one unit to its first line (batch) that can still take it. */
  function onScanProduct(code: string) {
    const upper = code.toUpperCase();
    const matching = lines.filter((line) => line.skuBarcode === code || line.skuCode.toUpperCase() === upper);
    if (matching.length === 0) {
      setScanStatus({ tone: "error", text: `"${code}" is not on ${sourceNumber}.` });
      return;
    }
    const target = matching.find(
      (line) => toThousandths(quantities[line.id] ?? "") + 1000n <= toThousandths(line.returnable),
    );
    if (!target) {
      setScanStatus({ tone: "error", text: `No more of ${matching[0].skuCode} can be returned against ${sourceNumber}.` });
      return;
    }
    const next = fromThousandths(toThousandths(quantities[target.id] ?? "") + 1000n);
    setQuantities((current) => ({ ...current, [target.id]: next }));
    setScanStatus({ tone: "success", text: `${target.skuCode} batch ${target.batchNumber}: returning ${next}.` });
  }

  const post = useApiMutation((body: unknown) => apiRequest<{ id: string }>(config.endpoint, { body }));
  const submitted = lines.filter((line) => (quantities[line.id] ?? "").trim() !== "");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setClientError(null);
    if (submitted.length === 0) {
      setClientError("Enter the quantity returned for at least one line.");
      return;
    }
    const result = await post.mutate({
      [config.sourceField]: sourceId,
      godownId,
      reason,
      remarks: remarks || undefined,
      idempotencyKey,
      items: submitted.map((line) => ({ [config.lineField]: line.id, quantity: quantities[line.id] })),
    });
    if (result) {
      pushFresh(router, `${config.endpoint}/${result.id}`);
    }
  }

  const errorFor = (lineId: string) => {
    const index = submitted.findIndex((line) => line.id === lineId);
    return index >= 0 ? post.fieldErrors[`items.${index}.quantity`] : undefined;
  };
  const overReturn = post.error?.code === "OVER_RETURN" ? (post.error.details as Record<string, string>) : null;
  const stockError = post.error?.code === "INSUFFICIENT_STOCK" ? (post.error.details as Record<string, string>) : null;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {(clientError || (post.error && !Object.keys(post.fieldErrors).length)) && (
        <Alert tone="error" title={clientError ?? post.error?.message}>
          {overReturn && `${overReturn.sku}: at most ${formatQuantity(overReturn.returnable)} can be returned.`}
          {stockError &&
            `${stockError.sku} batch ${stockError.batch} in ${stockError.godown}: available ${formatQuantity(stockError.available)}.`}
        </Alert>
      )}

      <Card>
        <CardHeader title="Return details" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={config.godownLabel} htmlFor="godownId" error={post.fieldErrors.godownId} required>
            <Select id="godownId" value={godownId} onChange={(e) => setGodownId(e.target.value)}>
              {godowns.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reason" htmlFor="reason" error={post.fieldErrors.reason} required>
            <Input id="reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Remarks" htmlFor="remarks" error={post.fieldErrors.remarks} className="md:col-span-2">
            <Textarea id="remarks" value={remarks} maxLength={500} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Lines" description="Leave a line empty to skip it. Scan a product to add one unit." />
        <div className="border-b border-slate-200 px-5 py-3">
          <ScanInput label="Scan returned product" onScan={onScanProduct} status={scanStatus} className="max-w-xl" />
        </div>
        <Table>
          <THead>
            <tr>
              <TH>SKU</TH>
              <TH>Batch</TH>
              <TH numeric>Returnable</TH>
              <TH>Returning</TH>
            </tr>
          </THead>
          <TBody>
            {lines.map((line) => (
              <tr key={line.id} className="align-top">
                <TD>
                  <span className="font-medium text-slate-900">{line.skuCode}</span>
                  <span className="block text-xs text-slate-500">{line.skuName}</span>
                </TD>
                <TD className="font-mono text-xs">{line.batchNumber}</TD>
                <TD numeric>
                  {formatQuantity(line.returnable)} <span className="text-xs text-slate-400">{line.unit}</span>
                </TD>
                <TD>
                  <Input
                    aria-label={`Quantity returned for ${line.skuCode} ${line.batchNumber}`}
                    inputMode="decimal"
                    value={quantities[line.id] ?? ""}
                    disabled={line.returnable === "0"}
                    onChange={(e) => setQuantities({ ...quantities, [line.id]: e.target.value })}
                    className="w-28"
                    aria-invalid={Boolean(errorFor(line.id))}
                  />
                  {errorFor(line.id) && <p className="mt-1 text-xs text-red-600">{errorFor(line.id)}</p>}
                </TD>
              </tr>
            ))}
          </TBody>
        </Table>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={post.pending}>
          {config.submitLabel}
        </Button>
      </div>
    </form>
  );
}
