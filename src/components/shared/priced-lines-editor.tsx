"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form-controls";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import type { SkuOption } from "@/lib/options";

export interface PricedLine {
  key: string;
  skuId: string;
  quantity: string;
  /** Unit the quantity and rate are entered in; "" = the SKU's base unit. */
  uomId: string;
  rate: string;
  gstRate: string;
}

export const emptyPricedLine = (): PricedLine => ({
  key: crypto.randomUUID(),
  skuId: "",
  quantity: "",
  uomId: "",
  rate: "",
  gstRate: "",
});

/**
 * Editable SKU / quantity / rate / GST lines, shared by purchase orders and
 * invoices. Quantity and rate may be entered in an alternate unit of the SKU
 * (e.g. BOX); the server converts to the base unit. `quantityField` is the API field name used in error paths
 * (e.g. "orderedQty" → errors["items.0.orderedQty"]).
 */
export function PricedLinesEditor({
  lines,
  onChange,
  skus,
  errors,
  quantityField = "quantity",
}: {
  lines: PricedLine[];
  onChange: (lines: PricedLine[]) => void;
  skus: SkuOption[];
  errors: Record<string, string>;
  quantityField?: string;
}) {
  const skuById = new Map(skus.map((s) => [s.id, s]));
  const update = (key: string, patch: Partial<PricedLine>) =>
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  return (
    <Card>
      <CardHeader
        title="Items"
        description="One line per SKU."
        actions={
          <Button variant="secondary" size="sm" onClick={() => onChange([...lines, emptyPricedLine()])}>
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
            <TH>Rate (₹ per unit)</TH>
            <TH>GST %</TH>
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
                    onChange={(e) => {
                      const next = skuById.get(e.target.value);
                      // The product's GST rate is filled in, unless the line already has a rate that was typed.
                      const gstFollowsSku = !line.gstRate || line.gstRate === (sku?.gstRate ?? "");
                      update(line.key, {
                        skuId: e.target.value,
                        uomId: "",
                        gstRate: gstFollowsSku ? (next?.gstRate ?? "") : line.gstRate,
                      });
                    }}
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
                      value={line.quantity}
                      onChange={(e) => update(line.key, { quantity: e.target.value })}
                      aria-invalid={Boolean(err(quantityField))}
                      className="w-28"
                    />
                    {sku && sku.units.length > 0 ? (
                      <Select
                        aria-label={`Unit for line ${index + 1}`}
                        value={line.uomId}
                        onChange={(e) => update(line.key, { uomId: e.target.value })}
                        className="w-24"
                      >
                        <option value="">{sku.unit}</option>
                        {sku.units.map((u) => (
                          <option key={u.uomId} value={u.uomId}>
                            {u.code}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-xs text-slate-500">{sku?.unit}</span>
                    )}
                  </div>
                  {sku && <BaseQuantityHint sku={sku} line={line} />}
                  {err(quantityField) && <p className="mt-1 text-xs text-red-600">{err(quantityField)}</p>}
                </TD>
                <TD>
                  <Input
                    aria-label={`Rate for line ${index + 1}`}
                    inputMode="decimal"
                    value={line.rate}
                    onChange={(e) => update(line.key, { rate: e.target.value })}
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
                    onChange={(e) => update(line.key, { gstRate: e.target.value })}
                    aria-invalid={Boolean(err("gstRate"))}
                    className="w-20"
                  />
                  {err("gstRate") && <p className="mt-1 text-xs text-red-600">{err("gstRate")}</p>}
                  {!err("gstRate") && sku?.hsnCode && <p className="mt-1 text-xs text-slate-500">HSN {sku.hsnCode}</p>}
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

/** "= 48 PCS" under a quantity entered in an alternate unit (display only; the server converts exactly). */
function BaseQuantityHint({ sku, line }: { sku: SkuOption; line: PricedLine }) {
  const unit = sku.units.find((u) => u.uomId === line.uomId);
  const quantity = Number(line.quantity);
  if (!unit || !line.quantity || !Number.isFinite(quantity)) return null;
  const base = quantity * Number(unit.factor);
  return (
    <p className="mt-1 text-xs text-slate-500">
      = {base.toLocaleString("en-IN", { maximumFractionDigits: 3 })} {sku.unit}
    </p>
  );
}
