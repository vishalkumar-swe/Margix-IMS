import { toDecimal, type Decimal } from "@/server/db/decimal";
import { ValidationError } from "@/server/errors";

export interface SkuUnits {
  code: string;
  baseUomId: string;
  baseUom: { code: string; decimalPlaces: number };
  units: { uomId: string; factor: Decimal; uom: { code: string } }[];
}

export interface EntrySnapshot {
  uomId: string;
  quantity: Decimal;
  factor: Decimal;
}

/**
 * Converts a quantity entered in any unit of the SKU to its base unit.
 * Returns the base quantity and, for an alternate unit, the as-entered
 * snapshot to store alongside it. The result must be exact in the base unit
 * (e.g. 0.1 BOX of 24 PCS = 2.4 PCS is refused when PCS are whole units).
 */
export function toBaseQuantity(
  sku: SkuUnits,
  quantity: string,
  uomId?: string | null,
): { baseQuantity: Decimal; entry: EntrySnapshot | null } {
  const entered = toDecimal(quantity);
  if (!uomId || uomId === sku.baseUomId) return { baseQuantity: entered, entry: null };

  const unit = sku.units.find((u) => u.uomId === uomId);
  if (!unit) {
    throw new ValidationError(`That unit is not set up for ${sku.code}.`, { sku: sku.code });
  }

  const baseQuantity = entered.times(unit.factor);
  if (baseQuantity.decimalPlaces() > sku.baseUom.decimalPlaces) {
    throw new ValidationError(
      `${entered.toString()} ${unit.uom.code} of ${sku.code} is ${baseQuantity.toString()} ${sku.baseUom.code}; ` +
        (sku.baseUom.decimalPlaces === 0
          ? `${sku.baseUom.code} must be whole.`
          : `${sku.baseUom.code} allows at most ${sku.baseUom.decimalPlaces} decimal places.`),
      { sku: sku.code },
    );
  }
  return { baseQuantity, entry: { uomId, quantity: entered, factor: unit.factor } };
}
