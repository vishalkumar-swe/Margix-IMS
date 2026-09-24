import type { MovementType } from "@prisma/client";
import type { Decimal } from "@/server/db/decimal";
import { ValidationError } from "@/server/errors";

/** Movement types that add stock (spec §5.4). */
export const INBOUND_MOVEMENTS: ReadonlySet<MovementType> = new Set([
  "OPENING",
  "INWARD",
  "TRANSFER_IN",
  "RETURN_IN",
]);

/** Movement types that remove stock (spec §5.4). */
export const OUTBOUND_MOVEMENTS: ReadonlySet<MovementType> = new Set([
  "OUTWARD",
  "TRANSFER_OUT",
  "RETURN_OUT",
]);

/**
 * Guards the ledger sign convention in code (the DB CHECK
 * `inventory_ledger_sign_chk` enforces the same rule). A violation is a
 * programming error, not user input, so it throws a plain Error.
 */
export function assertQuantitySign(movementType: MovementType, quantity: Decimal): void {
  const valid = INBOUND_MOVEMENTS.has(movementType)
    ? quantity.isPositive() && !quantity.isZero()
    : OUTBOUND_MOVEMENTS.has(movementType)
      ? quantity.isNegative() && !quantity.isZero()
      : !quantity.isZero();

  if (!valid) {
    throw new Error(`Invalid quantity ${quantity.toString()} for movement type ${movementType}`);
  }
}

/** Quantities may not be more precise than the SKU's unit allows (e.g. PCS → whole numbers). */
export function assertUomPrecision(
  quantity: Decimal,
  sku: { code: string; baseUom: { code: string; decimalPlaces: number } },
): void {
  if (quantity.decimalPlaces() > sku.baseUom.decimalPlaces) {
    throw new ValidationError(
      sku.baseUom.decimalPlaces === 0
        ? `${sku.code} is counted in whole ${sku.baseUom.code}.`
        : `${sku.code} allows at most ${sku.baseUom.decimalPlaces} decimal places.`,
      { sku: sku.code, quantity: quantity.toString() },
    );
  }
}
