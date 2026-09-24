"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form-controls";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { formatQuantity } from "@/lib/format";
import type { SkuOption } from "@/lib/options";
import { AvailableBatchSelect } from "./available-batch-select";

export interface BatchLine {
  key: string;
  skuId: string;
  batchId: string;
  available: string | null;
  quantity: string;
}

export const emptyBatchLine = (): BatchLine => ({
  key: crypto.randomUUID(),
  skuId: "",
  batchId: "",
  available: null,
  quantity: "",
});

/**
 * Lines that take stock out of one godown: SKU → batch with stock there
 * (FEFO order, available quantity shown) → quantity. Shared by dispatches and
 * transfers.
 */
export function BatchLinesEditor({
  title = "Items",
  description,
  lines,
  onChange,
  skus,
  godownId,
  errors,
  lineHint,
}: {
  title?: string;
  description?: string;
  lines: BatchLine[];
  onChange: (lines: BatchLine[]) => void;
  skus: SkuOption[];
  godownId: string;
  errors: Record<string, string>;
  lineHint?: (line: BatchLine) => ReactNode;
}) {
  const skuById = new Map(skus.map((s) => [s.id, s]));
  const update = (key: string, patch: Partial<BatchLine>) =>
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        actions={
          <Button variant="secondary" size="sm" onClick={() => onChange([...lines, emptyBatchLine()])}>
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
                    onChange={(e) => update(line.key, { skuId: e.target.value, batchId: "", available: null })}
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
                    godownId={godownId}
                    value={line.batchId}
                    unit={sku?.unit}
                    invalid={Boolean(err("batchId"))}
                    onChange={(batchId, available) => update(line.key, { batchId, available })}
                  />
                  {err("batchId") && <p className="mt-1 text-xs text-red-600">{err("batchId")}</p>}
                </TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={`Quantity for line ${index + 1}`}
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(e) => update(line.key, { quantity: e.target.value })}
                      className="w-28"
                      aria-invalid={Boolean(err("quantity"))}
                    />
                    <span className="text-xs text-slate-500">{sku?.unit}</span>
                  </div>
                  {line.available && <p className="mt-1 text-xs text-slate-500">Available {formatQuantity(line.available)}</p>}
                  {lineHint?.(line)}
                  {err("quantity") && <p className="mt-1 text-xs text-red-600">{err("quantity")}</p>}
                </TD>
                <TD className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
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
  );
}
