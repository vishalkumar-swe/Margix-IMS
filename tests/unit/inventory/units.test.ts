import { describe, expect, it } from "vitest";
import { toDecimal } from "@/server/db/decimal";
import type { AppError } from "@/server/errors";
import { toBaseQuantity, type SkuUnits } from "@/server/modules/inventory/units";

const bottle: SkuUnits = {
  code: "FG-001",
  baseUomId: "pcs",
  baseUom: { code: "PCS", decimalPlaces: 0 },
  units: [{ uomId: "box", factor: toDecimal("24"), uom: { code: "BOX" } }],
};
const resin: SkuUnits = {
  code: "RM-001",
  baseUomId: "kg",
  baseUom: { code: "KG", decimalPlaces: 3 },
  units: [{ uomId: "bag", factor: toDecimal("25.5"), uom: { code: "BAG" } }],
};

describe("toBaseQuantity", () => {
  it("passes base-unit quantities through unchanged", () => {
    expect(toBaseQuantity(bottle, "10").baseQuantity.toString()).toBe("10");
    expect(toBaseQuantity(bottle, "10", "pcs").entry).toBeNull();
  });

  it("converts alternate units exactly and keeps the entry snapshot", () => {
    const { baseQuantity, entry } = toBaseQuantity(bottle, "2.5", "box");
    expect(baseQuantity.toString()).toBe("60");
    expect(entry).toMatchObject({ uomId: "box" });
    expect([entry!.quantity.toString(), entry!.factor.toString()]).toEqual(["2.5", "24"]);
    expect(toBaseQuantity(resin, "3", "bag").baseQuantity.toString()).toBe("76.5");
  });

  it("refuses conversions that are not exact in the base unit", () => {
    const error = (() => {
      try {
        toBaseQuantity(bottle, "0.1", "box");
      } catch (e) {
        return e as AppError;
      }
    })();
    expect(error?.message).toBe("0.1 BOX of FG-001 is 2.4 PCS; PCS must be whole.");
  });

  it("refuses units that are not configured for the SKU", () => {
    expect(() => toBaseQuantity(bottle, "1", "crate")).toThrow("That unit is not set up for FG-001.");
  });
});
