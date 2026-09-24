import { describe, expect, it } from "vitest";
import {
  codeSchema,
  compareQuantities,
  quantitySchema,
  signedQuantitySchema,
} from "@/lib/validation/common";
import { partyCreateSchema, skuUpdateSchema } from "@/lib/validation/masters";

describe("quantity schemas", () => {
  it.each([
    ["12", "12"],
    [12.5, "12.5"],
    [" 0.125 ", "0.125"],
  ])("accepts %j", (input, expected) => {
    expect(quantitySchema.parse(input)).toBe(expected);
  });

  it.each(["0", "-1", "1.2345", "abc", "", "1e3", Number.NaN])("rejects %j", (input) => {
    expect(quantitySchema.safeParse(input).success).toBe(false);
  });

  it("allows signed, non-zero adjustments", () => {
    expect(signedQuantitySchema.parse("-25")).toBe("-25");
    expect(signedQuantitySchema.safeParse("0").success).toBe(false);
    expect(signedQuantitySchema.safeParse("-0.000").success).toBe(false);
  });
});

describe("compareQuantities", () => {
  it("compares exactly without floating point", () => {
    expect(compareQuantities("0.3", "0.30")).toBe(0);
    expect(compareQuantities("940", "950")).toBe(-1);
    expect(compareQuantities("999999999999999.999", "999999999999999.998")).toBe(1);
    expect(compareQuantities("-1", "0")).toBe(-1);
  });
});

describe("master field schemas", () => {
  it("normalises codes and GSTINs", () => {
    expect(codeSchema.parse(" rm-001 ")).toBe("RM-001");
    expect(codeSchema.safeParse("bad code").success).toBe(false);
    expect(partyCreateSchema.parse({ code: "s1", name: "X", gstin: "27aaacg1234f1z5" }).gstin).toBe("27AAACG1234F1Z5");
    expect(partyCreateSchema.safeParse({ code: "s1", name: "X", gstin: "123" }).success).toBe(false);
  });

  it("distinguishes 'unchanged' from 'clear' on updates", () => {
    expect(skuUpdateSchema.parse({})).toEqual({});
    expect(skuUpdateSchema.parse({ hsnCode: "", gstRate: "", categoryId: "" })).toEqual({
      hsnCode: null,
      gstRate: null,
      categoryId: null,
    });
  });
});
