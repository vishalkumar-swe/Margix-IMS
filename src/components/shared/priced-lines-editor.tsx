"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/form-controls";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { ScanInput, type ScanStatus } from "@/features/scan/scan-input";
import { resolveScannedSku } from "@/features/scan/scan-lookup";
import { formatAmount } from "@/lib/format";
import type { SkuOption } from "@/lib/options";
import { computeTax, formatScaled, parseScaled, type TaxType } from "@/lib/tax";
import { TaxTotals } from "./tax-totals";

export interface PricedLine {
  key: string;
  skuId: string;
  quantity: string;
  /** Unit the quantity and rate are entered in; "" = the SKU's base unit. */
  uomId: string;
  rate: string;
  discountPercent: string;
  gstRate: string;
}

export interface OtherCharges {
  amount: string;
  label: string;
}

export const emptyPricedLine = (): PricedLine => ({
  key: crypto.randomUUID(),
  skuId: "",
  quantity: "",
  uomId: "",
  rate: "",
  discountPercent: "",
  gstRate: "",
});

type LinesUpdate = PricedLine[] | ((current: PricedLine[]) => PricedLine[]);

/** "2.5" + 1 → "3.5", exactly (quantities have at most 3 decimals). */
function incrementQuantity(quantity: string): string {
  const current = parseScaled(quantity, 3) ?? 0n;
  return formatScaled(current + 1000n, 3).replace(/\.?0+$/, "");
}

/**
 * Editable SKU / quantity / rate / discount / GST lines with live totals,
 * shared by purchase orders and invoices. Quantity and rate may be entered in
 * an alternate unit of the SKU (e.g. BOX); the server converts to the base
 * unit. Scanning a product barcode adds a line for it, or adds one to its
 * quantity. Totals use lib/tax.ts, the same arithmetic as the server.
 * `quantityField` is the API field name used in error paths (e.g.
 * "orderedQty" → errors["items.0.orderedQty"]).
 */
export function PricedLinesEditor({
  lines,
  onChange,
  skus,
  errors,
  quantityField = "quantity",
  taxType,
  taxNote,
  otherCharges,
  onOtherChargesChange,
}: {
  lines: PricedLine[];
  /** Accepts a value or an updater (pass the state setter). */
  onChange: (update: LinesUpdate) => void;
  skus: SkuOption[];
  errors: Record<string, string>;
  quantityField?: string;
  taxType: TaxType;
  /** Shown with the totals, e.g. why the tax is treated as intra-state. */
  taxNote?: string;
  otherCharges: OtherCharges;
  onOtherChargesChange: (value: OtherCharges) => void;
}) {
  const skuById = new Map(skus.map((s) => [s.id, s]));
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const update = (key: string, patch: Partial<PricedLine>) =>
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const totals = computeTax({
    taxType,
    otherCharges: otherCharges.amount,
    lines: lines.map((line) => ({
      quantity: line.quantity,
      rate: line.rate,
      discountPercent: line.discountPercent,
      gstRate: line.gstRate,
    })),
  });

  async function addScanned(code: string) {
    const result = await resolveScannedSku(skus, code, "cannot be added to this document");
    if ("error" in result) {
      setScanStatus({ tone: "error", text: result.error });
      return;
    }
    const { sku } = result;
    const existing = lines.find((line) => line.skuId === sku.id);
    if (existing?.uomId) {
      const unit = sku.units.find((u) => u.uomId === existing.uomId)?.code;
      setScanStatus({ tone: "error", text: `${sku.code} is entered in ${unit}; change its quantity on the line.` });
      return;
    }
    onChange((current) => {
      const line = current.find((l) => l.skuId === sku.id);
      if (line) {
        return current.map((l) => (l.key === line.key ? { ...l, quantity: incrementQuantity(l.quantity) } : l));
      }
      const added = { skuId: sku.id, uomId: "", quantity: "1", gstRate: sku.gstRate ?? "" };
      const blank = current.find((l) => !l.skuId);
      return blank
        ? current.map((l) => (l.key === blank.key ? { ...l, ...added } : l))
        : [...current, { ...emptyPricedLine(), ...added }];
    });
    setScanStatus({
      tone: "success",
      text: existing ? `${sku.code}: quantity +1.` : `Added ${sku.code} · ${sku.name}.`,
    });
  }

  return (
    <Card>
      <CardHeader
        title="Items"
        description="One line per SKU. Scan a product barcode to add it."
        actions={
          <Button variant="secondary" size="sm" onClick={() => onChange([...lines, emptyPricedLine()])}>
            <Plus aria-hidden /> Add line
          </Button>
        }
      />
      <div className="border-b border-slate-200 px-5 py-3">
        <ScanInput label="Scan product" onScan={addScanned} status={scanStatus} className="max-w-xl" />
      </div>
      {errors.items && <p className="px-5 pt-3 text-sm text-red-600">{errors.items}</p>}
      <Table>
        <THead>
          <tr>
            <TH className="w-1/3">SKU</TH>
            <TH>Quantity</TH>
            <TH>Rate (₹ per unit)</TH>
            <TH>Disc %</TH>
            <TH>GST %</TH>
            <TH numeric>Amount (₹)</TH>
            <TH className="sr-only">Remove</TH>
          </tr>
        </THead>
        <TBody>
          {lines.map((line, index) => {
            const sku = skuById.get(line.skuId);
            const err = (field: string) => errors[`items.${index}.${field}`];
            const value = totals.lines[index];
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
                      className="w-24"
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
                    aria-label={`Discount for line ${index + 1}`}
                    inputMode="decimal"
                    placeholder="0"
                    value={line.discountPercent}
                    onChange={(e) => update(line.key, { discountPercent: e.target.value })}
                    aria-invalid={Boolean(err("discountPercent"))}
                    className="w-20"
                  />
                  {err("discountPercent") && <p className="mt-1 text-xs text-red-600">{err("discountPercent")}</p>}
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
                <TD numeric className="pt-5">
                  <span className="font-medium text-slate-900">{formatAmount(value.total)}</span>
                  {value.tax !== "0.00" && (
                    <span className="block text-xs text-slate-500">
                      {formatAmount(value.taxable)} + GST {formatAmount(value.tax)}
                    </span>
                  )}
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
      <CardBody className="grid grid-cols-1 gap-6 border-t border-slate-200 md:grid-cols-2">
        <div className="grid grid-cols-1 content-start gap-4 sm:grid-cols-2">
          <Field
            label="Other charges (₹)"
            htmlFor="otherCharges"
            error={errors.otherCharges}
            hint="Freight, packing etc. Added after GST, not taxed."
          >
            <Input
              id="otherCharges"
              inputMode="decimal"
              placeholder="0.00"
              value={otherCharges.amount}
              onChange={(e) => onOtherChargesChange({ ...otherCharges, amount: e.target.value })}
              aria-invalid={Boolean(errors.otherCharges)}
            />
          </Field>
          <Field label="Charges label" htmlFor="otherChargesLabel" error={errors.otherChargesLabel}>
            <Input
              id="otherChargesLabel"
              placeholder="e.g. Freight"
              maxLength={60}
              value={otherCharges.label}
              onChange={(e) => onOtherChargesChange({ ...otherCharges, label: e.target.value })}
            />
          </Field>
        </div>
        <div>
          <TaxTotals summary={totals} otherChargesLabel={otherCharges.label.trim() || null} />
          <p className="mt-2 text-xs text-slate-500">
            {taxType === "INTRA" ? "Intra-state supply: CGST + SGST." : "Inter-state supply: IGST."}
            {taxNote && <> {taxNote}</>}
          </p>
        </div>
      </CardBody>
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
