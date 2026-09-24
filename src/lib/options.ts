/**
 * Plain, serialisable option shapes that server pages hand to client forms
 * (Prisma Decimal/BigInt values never cross the server/client boundary).
 */

import { partyStateCode } from "@/lib/gst-states";

export interface SkuOption {
  id: string;
  code: string;
  name: string;
  /** Base unit code. */
  unit: string;
  baseUomId: string;
  decimalPlaces: number;
  isBatchTracked: boolean;
  /** Alternate units: 1 unit = factor base units. */
  units: { uomId: string; code: string; factor: string }[];
  hsnCode: string | null;
  /** Applied GST rate (from the HSN master unless overridden on the SKU). */
  gstRate: string | null;
  /** Product barcode, matched when a line is added by scanning. */
  barcode: string | null;
}

export interface NamedOption {
  id: string;
  code: string;
  name: string;
}

/** A supplier or customer with its GST state (from the GSTIN, else its state code). */
export interface PartyOption extends NamedOption {
  stateCode: string | null;
}

export function toSkuOption(sku: {
  id: string;
  code: string;
  name: string;
  isBatchTracked: boolean;
  baseUomId: string;
  baseUom: { code: string; decimalPlaces: number };
  units?: { uomId: string; factor: { toString(): string }; uom: { code: string } }[];
  hsnCode?: string | null;
  gstRate?: { toString(): string } | null;
  barcode?: string | null;
}): SkuOption {
  return {
    id: sku.id,
    code: sku.code,
    name: sku.name,
    unit: sku.baseUom.code,
    baseUomId: sku.baseUomId,
    decimalPlaces: sku.baseUom.decimalPlaces,
    isBatchTracked: sku.isBatchTracked,
    units: (sku.units ?? []).map((u) => ({ uomId: u.uomId, code: u.uom.code, factor: u.factor.toString() })),
    hsnCode: sku.hsnCode ?? null,
    gstRate: sku.gstRate?.toString() ?? null,
    barcode: sku.barcode ?? null,
  };
}

export function toNamedOption(item: { id: string; code: string; name: string }): NamedOption {
  return { id: item.id, code: item.code, name: item.name };
}

export function toPartyOption(party: {
  id: string;
  code: string;
  name: string;
  gstin: string | null;
  stateCode: string | null;
}): PartyOption {
  return { ...toNamedOption(party), stateCode: partyStateCode(party) };
}
