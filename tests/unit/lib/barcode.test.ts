import { describe, expect, it } from "vitest";
import {
  barcodeProblem,
  barcodeSymbology,
  ean13CheckDigit,
  findByScanCode,
  internalEan13,
  isValidEan13,
} from "@/lib/barcode";

describe("EAN-13", () => {
  it("computes the check digit", () => {
    expect(ean13CheckDigit("400638133393")).toBe(1); // 4006381333931
    expect(ean13CheckDigit("890123456789")).toBe(0); // an Indian (890) prefix
    expect(ean13CheckDigit("200000000001")).toBe(5);
    expect(() => ean13CheckDigit("12345")).toThrow();
  });

  it("validates complete codes", () => {
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("4006381333932")).toBe(false);
    expect(isValidEan13("400638133393")).toBe(false);
    expect(isValidEan13("400638133393A")).toBe(false);
  });

  it("builds internal codes in the 2xx in-store range", () => {
    expect(internalEan13(1)).toBe("2000000000015");
    expect(internalEan13(2)).toBe("2000000000022");
    expect(internalEan13(123456)).toMatch(/^200000123456\d$/);
    for (const sequence of [1, 42, 99_999_999_999]) expect(isValidEan13(internalEan13(sequence))).toBe(true);
    expect(() => internalEan13(0)).toThrow();
    expect(() => internalEan13(100_000_000_000)).toThrow();
  });
});

describe("barcodeProblem", () => {
  it("accepts EAN-13s with a correct check digit and any other Code 128 value", () => {
    expect(barcodeProblem("4006381333931")).toBeNull();
    expect(barcodeProblem("RM-001/A")).toBeNull();
    expect(barcodeProblem("12345678")).toBeNull();
  });

  it("rejects wrong check digits, spaces, non-ASCII and over-long values", () => {
    expect(barcodeProblem("4006381333932")).toMatch(/check digit/);
    expect(barcodeProblem("AB 12")).toMatch(/without spaces/);
    expect(barcodeProblem("€123")).not.toBeNull();
    expect(barcodeProblem("X".repeat(49))).not.toBeNull();
    expect(barcodeProblem("")).not.toBeNull();
  });

  it("prints EAN-13s as EAN-13 and everything else as Code 128", () => {
    expect(barcodeSymbology("4006381333931")).toBe("ean13");
    expect(barcodeSymbology("4006381333932")).toBe("code128");
    expect(barcodeSymbology("SKU-000001")).toBe("code128");
  });
});

describe("findByScanCode", () => {
  const items = [
    { id: "a", code: "RM-001", barcode: "2000000000015" },
    { id: "b", code: "FG-001", barcode: null },
    { id: "c", code: "2000000000022", barcode: "X-1" },
  ];

  it("matches a barcode exactly, else a code case-insensitively", () => {
    expect(findByScanCode(items, "2000000000015")?.id).toBe("a");
    expect(findByScanCode(items, " fg-001 ")?.id).toBe("b");
    expect(findByScanCode(items, "x-1")).toBeUndefined();
    expect(findByScanCode(items, "")).toBeUndefined();
  });

  it("prefers a barcode match over a code match", () => {
    const clash = [...items, { id: "d", code: "Y", barcode: "2000000000022" }];
    expect(findByScanCode(clash, "2000000000022")?.id).toBe("d");
  });
});
