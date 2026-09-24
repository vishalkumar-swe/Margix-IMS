/**
 * Plain, serialisable option shapes that server pages hand to client forms
 * (Prisma Decimal/BigInt values never cross the server/client boundary).
 */

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
}

export interface NamedOption {
  id: string;
  code: string;
  name: string;
}

export function toSkuOption(sku: {
  id: string;
  code: string;
  name: string;
  isBatchTracked: boolean;
  baseUomId: string;
  baseUom: { code: string; decimalPlaces: number };
  units?: { uomId: string; factor: { toString(): string }; uom: { code: string } }[];
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
  };
}

export function toNamedOption(item: { id: string; code: string; name: string }): NamedOption {
  return { id: item.id, code: item.code, name: item.name };
}
