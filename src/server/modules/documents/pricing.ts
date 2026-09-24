import { partyStateCode } from "@/lib/gst-states";
import {
  computeTax,
  resolveTaxType,
  type PricedDocumentView,
  type TaxSummary,
  type TaxType,
} from "@/lib/tax";
import { getCompanyDetails } from "@/server/config/company";

/**
 * Pricing of documents: the GST terms fixed when a purchase order or invoice
 * is saved, and the serialisable line/summary view that detail pages and
 * printed documents render. The arithmetic itself lives in lib/tax.ts.
 */

type Decimalish = { toString(): string };

export interface DocumentTaxTerms {
  taxType: TaxType;
  /** GST state code of the place of supply, or null when unknown. */
  placeOfSupply: string | null;
  /** False when the company's or the party's state is unknown (treated as intra-state). */
  statesKnown: boolean;
}

/**
 * Intra- or inter-state for a document with this party. The place of supply
 * of goods is where they are delivered: the customer's state on a sale, our
 * own state on a purchase.
 */
export function documentTaxTerms(
  direction: "purchase" | "sale",
  party: { gstin: string | null; stateCode: string | null },
): DocumentTaxTerms {
  const ourState = getCompanyDetails().stateCode ?? null;
  const theirState = partyStateCode(party);
  const { taxType, statesKnown } = resolveTaxType(ourState, theirState);
  return { taxType, placeOfSupply: direction === "sale" ? theirState : ourState, statesKnown };
}

interface PricedLineSource {
  key: string;
  lineNo: number;
  sku: { code: string; name: string };
  hsnCode: string | null;
  quantity: Decimalish;
  unit: string;
  rate: Decimalish | null;
  rateUnit: string;
  /** Units of `quantity` per rate unit (e.g. 24 PCS per BOX); default 1. */
  rateFactor?: Decimalish | null;
  discountPercent: Decimalish;
  gstRate: Decimalish | null;
}

interface DocumentTerms {
  taxType: TaxType;
  placeOfSupply: string | null;
  otherCharges: Decimalish;
  otherChargesLabel: string | null;
}

function pricedView(terms: DocumentTerms, lines: PricedLineSource[]): PricedDocumentView {
  const summary = computeTax({
    taxType: terms.taxType,
    otherCharges: terms.otherCharges.toString(),
    lines: lines.map((line) => ({
      quantity: line.quantity.toString(),
      rate: line.rate?.toString() ?? null,
      rateFactor: line.rateFactor?.toString() ?? null,
      discountPercent: line.discountPercent.toString(),
      gstRate: line.gstRate?.toString() ?? null,
    })),
  });
  return {
    taxType: terms.taxType,
    placeOfSupply: terms.placeOfSupply,
    otherChargesLabel: terms.otherChargesLabel,
    summary,
    priced: lines.some((line) => line.rate !== null),
    lines: lines.map((line, index) => ({
      key: line.key,
      lineNo: line.lineNo,
      skuCode: line.sku.code,
      skuName: line.sku.name,
      hsnCode: line.hsnCode,
      quantity: line.quantity.toString(),
      unit: line.unit,
      rate: line.rate?.toString() ?? null,
      rateUnit: line.rateUnit,
      discountPercent: line.discountPercent.toString(),
      tax: summary.lines[index],
    })),
  };
}

interface OrderedLineNumbers {
  entryQuantity: Decimalish | null;
  rate: Decimalish | null;
  discountPercent: Decimalish;
  gstRate: Decimalish | null;
}

/**
 * Document-level totals of a saved purchase order or invoice (recorded in the
 * audit trail). Quantities are taken as entered, since the rate is per the
 * entered unit; `baseQuantity` gives the quantity of a base-unit line.
 */
export function documentTotals<T extends OrderedLineNumbers>(
  doc: { taxType: TaxType; otherCharges: Decimalish; items: T[] },
  baseQuantity: (item: T) => Decimalish,
): Omit<TaxSummary, "lines"> {
  const { taxType, subtotal, discount, taxable, cgst, sgst, igst, tax, otherCharges, grandTotal } = computeTax({
    taxType: doc.taxType,
    otherCharges: doc.otherCharges.toString(),
    lines: doc.items.map((item) => ({
      quantity: (item.entryQuantity ?? baseQuantity(item)).toString(),
      rate: item.rate?.toString() ?? null,
      discountPercent: item.discountPercent.toString(),
      gstRate: item.gstRate?.toString() ?? null,
    })),
  });
  return { taxType, subtotal, discount, taxable, cgst, sgst, igst, tax, otherCharges, grandTotal };
}

interface OrderedLine {
  id: string;
  lineNo: number;
  sku: { code: string; name: string; baseUom: { code: string } };
  hsnCode: string | null;
  entryQuantity: Decimalish | null;
  entryUom: { code: string } | null;
  rate: Decimalish | null;
  discountPercent: Decimalish;
  gstRate: Decimalish | null;
}

/** Lines as ordered/invoiced: quantity in the unit it was entered in (the rate is per that unit). */
function orderedLine(item: OrderedLine, baseQuantity: Decimalish): PricedLineSource {
  const unit = item.entryUom?.code ?? item.sku.baseUom.code;
  return {
    key: item.id,
    lineNo: item.lineNo,
    sku: item.sku,
    hsnCode: item.hsnCode,
    quantity: item.entryQuantity ?? baseQuantity,
    unit,
    rate: item.rate,
    rateUnit: unit,
    discountPercent: item.discountPercent,
    gstRate: item.gstRate,
  };
}

export function purchaseOrderPricing(po: DocumentTerms & { items: (OrderedLine & { orderedQty: Decimalish })[] }) {
  return pricedView(po, po.items.map((item) => orderedLine(item, item.orderedQty)));
}

export function invoicePricing(invoice: DocumentTerms & { items: (OrderedLine & { quantity: Decimalish })[] }) {
  return pricedView(invoice, invoice.items.map((item) => orderedLine(item, item.quantity)));
}

/** Priced source line of a delivery (GRN or dispatch line), whose quantity is in the base unit. */
interface SourcePricing {
  hsnCode: string | null;
  rate: Decimalish | null;
  entryUom: { code: string } | null;
  entryFactor: Decimalish | null;
  discountPercent: Decimalish;
  gstRate: Decimalish | null;
}

interface DeliveredLine {
  id: string;
  sku: { code: string; name: string; baseUom: { code: string } };
  quantity: Decimalish;
}

/** Value of delivered quantities at the price of the order/invoice line they belong to. */
function deliveredView(
  terms: Pick<DocumentTerms, "taxType" | "placeOfSupply">,
  lines: (DeliveredLine & { source: SourcePricing | null })[],
) {
  return pricedView(
    { ...terms, otherCharges: "0", otherChargesLabel: null },
    lines.map((line, index) => ({
      key: line.id,
      lineNo: index + 1,
      sku: line.sku,
      hsnCode: line.source?.hsnCode ?? null,
      quantity: line.quantity,
      unit: line.sku.baseUom.code,
      rate: line.source?.rate ?? null,
      rateUnit: line.source?.entryUom?.code ?? line.sku.baseUom.code,
      rateFactor: line.source?.entryFactor ?? null,
      discountPercent: line.source?.discountPercent ?? "0",
      gstRate: line.source?.gstRate ?? null,
    })),
  );
}

/** Accepted goods of a GRN valued at the purchase order's prices and tax terms. */
export function grnPricing(grn: {
  purchaseOrder: { taxType: TaxType; placeOfSupply: string | null };
  items: (Omit<DeliveredLine, "quantity"> & { acceptedQty: Decimalish; purchaseOrderItem: SourcePricing })[];
}) {
  return deliveredView(
    grn.purchaseOrder,
    grn.items.map((item) => ({ ...item, quantity: item.acceptedQty, source: item.purchaseOrderItem })),
  );
}

/** Dispatched goods valued at the invoice's prices and tax terms (null without an invoice). */
export function dispatchPricing(dispatch: {
  invoice: { taxType: TaxType; placeOfSupply: string | null } | null;
  items: (DeliveredLine & { invoiceItem: SourcePricing | null })[];
}) {
  if (!dispatch.invoice) return null;
  return deliveredView(
    dispatch.invoice,
    dispatch.items.map((item) => ({ ...item, source: item.invoiceItem })),
  );
}
