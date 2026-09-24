/**
 * GST arithmetic for priced documents (purchase orders, invoices and the notes
 * printed from them). The one implementation used by the forms (live totals),
 * detail pages, printed documents and the server.
 *
 * All money is integer paise (bigint), never a float:
 *   gross    = quantity × rate            (÷ rateFactor, rounded to paise)
 *   discount = gross × discount%           (rounded to paise)
 *   taxable  = gross − discount
 *   intra-state: CGST = SGST = taxable × rate/2 (each rounded); inter-state: IGST = taxable × rate
 *   line total = taxable + taxes; document totals are sums of the line values;
 *   other charges (freight, packing…) are added after tax and are not taxed.
 * Rounding is half-up to 2 decimals, per line.
 */

import type { TaxType } from "@/lib/enums";

export type { TaxType } from "@/lib/enums";

const MONEY_SCALE = 2;
const QTY_SCALE = 3;
const PERCENT_SCALE = 2;
const FACTOR_SCALE = 6;

/**
 * A non-negative decimal string as an integer scaled by 10^scale, rounding
 * half-up beyond the scale ("12.345", 2 → 1235n). Blank or malformed → null.
 */
export function parseScaled(value: string | null | undefined, scale: number): bigint | null {
  const match = /^\s*(\d*)(?:\.(\d*))?\s*$/.exec(value ?? "");
  if (!match || (match[1] === "" && (match[2] ?? "") === "")) return null;
  const [, int, frac = ""] = match;
  const kept = BigInt((int || "0") + frac.padEnd(scale, "0").slice(0, scale));
  return frac.length > scale && Number(frac[scale]) >= 5 ? kept + 1n : kept;
}

/** 123450n, 2 → "1234.50". */
export function formatScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, "0");
  const int = digits.slice(0, digits.length - scale);
  const frac = digits.slice(digits.length - scale);
  return `${negative ? "-" : ""}${int}${scale > 0 ? `.${frac}` : ""}`;
}

/** Like formatScaled but without trailing zeros: 900n, 2 → "9"; 250n, 2 → "2.5". */
function formatTrimmed(value: bigint, scale: number): string {
  return formatScaled(value, scale).replace(/\.?0+$/, "") || "0";
}

/** n ÷ d rounded half-up (n ≥ 0, d > 0). */
function divRound(n: bigint, d: bigint): bigint {
  return (2n * n + d) / (2n * d);
}

export interface TaxLineInput {
  /** Quantity in the unit the rate is quoted per (see rateFactor). */
  quantity: string;
  /** Price per unit; a line without a rate has no value. */
  rate?: string | null;
  discountPercent?: string | null;
  gstRate?: string | null;
  /**
   * Units of `quantity` in one rate unit, default 1. A receipt counted in PCS
   * against a line priced per BOX of 24 has rateFactor "24".
   */
  rateFactor?: string | null;
}

export interface TaxLine {
  gross: string;
  discount: string;
  taxable: string;
  /** Applied GST rate, e.g. "18"; CGST/SGST/IGST rates follow the tax type. */
  gstRate: string;
  cgstRate: string;
  sgstRate: string;
  igstRate: string;
  cgst: string;
  sgst: string;
  igst: string;
  tax: string;
  total: string;
}

export interface TaxSummary {
  taxType: TaxType;
  lines: TaxLine[];
  /** Sum of quantity × rate before discounts. */
  subtotal: string;
  discount: string;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  tax: string;
  otherCharges: string;
  grandTotal: string;
}

interface ScaledLine {
  gross: bigint;
  discount: bigint;
  taxable: bigint;
  cgst: bigint;
  sgst: bigint;
  igst: bigint;
  gstRate: bigint;
}

function computeScaledLine(line: TaxLineInput, taxType: TaxType): ScaledLine {
  const quantity = parseScaled(line.quantity, QTY_SCALE) ?? 0n;
  const rate = parseScaled(line.rate, MONEY_SCALE) ?? 0n;
  const factor = parseScaled(line.rateFactor, FACTOR_SCALE) || 10n ** BigInt(FACTOR_SCALE);
  const discountPercent = minBig(parseScaled(line.discountPercent, PERCENT_SCALE) ?? 0n, 100n * 100n);
  const gstRate = parseScaled(line.gstRate, PERCENT_SCALE) ?? 0n;

  // quantity (×10³) × rate (×10²) ÷ factor (×10⁶) → paise (×10²)
  const gross = divRound(quantity * rate * 1000n, factor);
  const discount = divRound(gross * discountPercent, 10_000n);
  const taxable = gross - discount;
  if (taxType === "INTER") {
    return { gross, discount, taxable, cgst: 0n, sgst: 0n, igst: divRound(taxable * gstRate, 10_000n), gstRate };
  }
  const half = divRound(taxable * gstRate, 20_000n);
  return { gross, discount, taxable, cgst: half, sgst: half, igst: 0n, gstRate };
}

function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/** Values of one line. */
export function computeLineTax(line: TaxLineInput, taxType: TaxType): TaxLine {
  return toTaxLine(computeScaledLine(line, taxType), taxType);
}

function toTaxLine(line: ScaledLine, taxType: TaxType): TaxLine {
  const money = (v: bigint) => formatScaled(v, MONEY_SCALE);
  const tax = line.cgst + line.sgst + line.igst;
  const intra = taxType === "INTRA";
  // Half of a 2-decimal rate needs 3 decimals (0.25% → 0.125%).
  const halfRate = formatTrimmed(line.gstRate * 5n, PERCENT_SCALE + 1);
  return {
    gross: money(line.gross),
    discount: money(line.discount),
    taxable: money(line.taxable),
    gstRate: formatTrimmed(line.gstRate, PERCENT_SCALE),
    cgstRate: intra ? halfRate : "0",
    sgstRate: intra ? halfRate : "0",
    igstRate: intra ? "0" : formatTrimmed(line.gstRate, PERCENT_SCALE),
    cgst: money(line.cgst),
    sgst: money(line.sgst),
    igst: money(line.igst),
    tax: money(tax),
    total: money(line.taxable + tax),
  };
}

/**
 * Line and document totals. Blank or malformed numbers count as zero, so the
 * forms can show totals while the user types; the server validates its input
 * before it computes anything.
 */
export function computeTax(input: { taxType: TaxType; lines: TaxLineInput[]; otherCharges?: string | null }): TaxSummary {
  const scaled = input.lines.map((line) => computeScaledLine(line, input.taxType));
  const sum = (pick: (line: ScaledLine) => bigint) => scaled.reduce((total, line) => total + pick(line), 0n);
  const money = (v: bigint) => formatScaled(v, MONEY_SCALE);

  const taxable = sum((l) => l.taxable);
  const tax = sum((l) => l.cgst + l.sgst + l.igst);
  const otherCharges = parseScaled(input.otherCharges, MONEY_SCALE) ?? 0n;
  return {
    taxType: input.taxType,
    lines: scaled.map((line) => toTaxLine(line, input.taxType)),
    subtotal: money(sum((l) => l.gross)),
    discount: money(sum((l) => l.discount)),
    taxable: money(taxable),
    cgst: money(sum((l) => l.cgst)),
    sgst: money(sum((l) => l.sgst)),
    igst: money(sum((l) => l.igst)),
    tax: money(tax),
    otherCharges: money(otherCharges),
    grandTotal: money(taxable + tax + otherCharges),
  };
}

/**
 * Intra-state (CGST + SGST) when both parties are in the same state,
 * inter-state (IGST) otherwise. When either state is unknown the document is
 * treated as intra-state and `statesKnown` is false, so the UI can say so.
 */
export function resolveTaxType(
  ourState: string | null | undefined,
  theirState: string | null | undefined,
): { taxType: TaxType; statesKnown: boolean } {
  if (!ourState || !theirState) return { taxType: "INTRA", statesKnown: false };
  return { taxType: ourState === theirState ? "INTRA" : "INTER", statesKnown: true };
}

// ---- Serialisable views of priced documents (built by the server, rendered anywhere) ----

/** One priced line, flattened to strings for rendering. */
export interface PricedLineView {
  key: string;
  lineNo: number;
  skuCode: string;
  skuName: string;
  hsnCode: string | null;
  /** Quantity in `unit`. */
  quantity: string;
  unit: string;
  rate: string | null;
  /** Unit the rate is quoted per. */
  rateUnit: string;
  discountPercent: string;
  tax: TaxLine;
}

export interface PricedDocumentView {
  taxType: TaxType;
  placeOfSupply: string | null;
  otherChargesLabel: string | null;
  lines: PricedLineView[];
  summary: TaxSummary;
  /** False when no line carries a rate (nothing to value). */
  priced: boolean;
}
