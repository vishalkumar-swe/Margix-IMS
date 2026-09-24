"use client";

import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form-controls";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { ScanInput, type ScanStatus } from "@/features/scan/scan-input";
import { resolveScannedSku } from "@/features/scan/scan-lookup";
import { apiRequest } from "@/lib/api-client";
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

interface FefoSuggestion {
  allocations: { batchId: string; batchNumber: string; quantity: string }[];
  shortfall: string;
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
 * (FEFO order, available quantity shown) → quantity. Entering a SKU and a
 * quantity first offers an automatic FEFO pick across batches. Scanning a
 * product barcode selects its line (adding one when needed). Shared by
 * dispatches and transfers.
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
  const [fefoMessages, setFefoMessages] = useState<Record<string, string>>({});
  const [fefoPending, setFefoPending] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const update = (key: string, patch: Partial<BatchLine>) =>
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  /** Replaces a line (SKU + total quantity) with one line per batch, earliest expiry first. */
  async function pickFefo(line: BatchLine) {
    setFefoPending(line.key);
    setFefoMessages((m) => ({ ...m, [line.key]: "" }));
    try {
      const params = new URLSearchParams({ skuId: line.skuId, godownId, quantity: line.quantity.trim() });
      const suggestion = await apiRequest<FefoSuggestion>(`/stock/fefo?${params.toString()}`);
      if (suggestion.allocations.length === 0) {
        setFefoMessages((m) => ({ ...m, [line.key]: "No unexpired stock of this SKU in the godown." }));
        return;
      }
      const picked = suggestion.allocations.map((a, index) => ({
        key: index === 0 ? line.key : crypto.randomUUID(),
        skuId: line.skuId,
        batchId: a.batchId,
        available: null,
        quantity: a.quantity,
      }));
      onChange(lines.flatMap((l) => (l.key === line.key ? picked : [l])));
      if (suggestion.shortfall !== "0") {
        setFefoMessages((m) => ({
          ...m,
          [line.key]: `Only part could be picked: ${formatQuantity(suggestion.shortfall)} short.`,
        }));
      }
    } catch (error) {
      setFefoMessages((m) => ({ ...m, [line.key]: error instanceof Error ? error.message : "Could not suggest batches." }));
    } finally {
      setFefoPending(null);
    }
  }

  /** Selects the scanned product's line: focuses it, or puts the product on a new line. */
  async function selectScanned(code: string) {
    const result = await resolveScannedSku(skus, code, "cannot be picked here");
    if ("error" in result) {
      setScanStatus({ tone: "error", text: result.error });
      return;
    }
    const { sku } = result;
    const index = lines.findIndex((line) => line.skuId === sku.id);
    if (index >= 0) {
      setScanStatus({ tone: "info", text: `${sku.code} is on line ${index + 1}.` });
      focusQuantity(lines[index].key);
      return;
    }
    const blank = lines.find((line) => !line.skuId);
    const line = { ...(blank ?? emptyBatchLine()), skuId: sku.id, batchId: "", available: null };
    onChange(blank ? lines.map((l) => (l.key === blank.key ? line : l)) : [...lines, line]);
    setScanStatus({ tone: "success", text: `Added ${sku.code} · ${sku.name}. Enter the quantity and pick a batch.` });
    focusQuantity(line.key);
  }

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
      <div className="border-b border-slate-200 px-5 py-3">
        <ScanInput label="Scan product" onScan={selectScanned} status={scanStatus} className="max-w-xl" />
      </div>
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
                  {!line.batchId && line.skuId && godownId && line.quantity.trim() && (
                    <Button
                      variant="link"
                      size="sm"
                      className="mt-1 h-auto"
                      loading={fefoPending === line.key}
                      onClick={() => pickFefo(line)}
                    >
                      {fefoPending !== line.key && <Sparkles aria-hidden />} Pick batches (FEFO)
                    </Button>
                  )}
                  {fefoMessages[line.key] && <p className="mt-1 text-xs text-amber-700">{fefoMessages[line.key]}</p>}
                </TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <Input
                      id={quantityInputId(line.key)}
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

const quantityInputId = (key: string) => `batch-line-qty-${key}`;

/** Focuses a line's quantity once it has rendered. */
function focusQuantity(key: string) {
  requestAnimationFrame(() => document.getElementById(quantityInputId(key))?.focus());
}
