/**
 * Plain, serialisable option shapes that server pages hand to client forms
 * (Prisma Decimal/BigInt values never cross the server/client boundary).
 */

export interface SkuOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  decimalPlaces: number;
  isBatchTracked: boolean;
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
  baseUom: { code: string; decimalPlaces: number };
}): SkuOption {
  return {
    id: sku.id,
    code: sku.code,
    name: sku.name,
    unit: sku.baseUom.code,
    decimalPlaces: sku.baseUom.decimalPlaces,
    isBatchTracked: sku.isBatchTracked,
  };
}

export function toNamedOption(item: { id: string; code: string; name: string }): NamedOption {
  return { id: item.id, code: item.code, name: item.name };
}
