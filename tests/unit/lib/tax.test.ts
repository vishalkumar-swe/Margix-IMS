import { describe, expect, it } from "vitest";
import { computeLineTax, computeTax, formatScaled, parseScaled, resolveTaxType } from "@/lib/tax";

describe("parseScaled / formatScaled", () => {
  it("scales decimal strings exactly and rounds half-up beyond the scale", () => {
    expect(parseScaled("12", 2)).toBe(1200n);
    expect(parseScaled("12.5", 2)).toBe(1250n);
    expect(parseScaled(".5", 2)).toBe(50n);
    expect(parseScaled("12.345", 2)).toBe(1235n);
    expect(parseScaled("12.3449", 2)).toBe(1234n);
    expect(parseScaled(" 7 ", 3)).toBe(7000n);
  });

  it("treats blank and malformed input as missing", () => {
    for (const value of ["", "  ", ".", "abc", "-1", "1,000", "1e3", null, undefined]) {
      expect(parseScaled(value, 2)).toBeNull();
    }
  });

  it("formats with fixed decimals", () => {
    expect(formatScaled(123450n, 2)).toBe("1234.50");
    expect(formatScaled(5n, 2)).toBe("0.05");
    expect(formatScaled(0n, 3)).toBe("0.000");
    expect(formatScaled(-150n, 2)).toBe("-1.50");
  });
});

describe("computeLineTax", () => {
  it("splits GST equally into CGST and SGST within a state", () => {
    expect(computeLineTax({ quantity: "10", rate: "100", gstRate: "18" }, "INTRA")).toEqual({
      gross: "1000.00",
      discount: "0.00",
      taxable: "1000.00",
      gstRate: "18",
      cgstRate: "9",
      sgstRate: "9",
      igstRate: "0",
      cgst: "90.00",
      sgst: "90.00",
      igst: "0.00",
      tax: "180.00",
      total: "1180.00",
    });
  });

  it("charges IGST across states", () => {
    const line = computeLineTax({ quantity: "10", rate: "100", gstRate: "18" }, "INTER");
    expect(line).toMatchObject({ cgst: "0.00", sgst: "0.00", igst: "180.00", igstRate: "18", cgstRate: "0", total: "1180.00" });
  });

  it("applies the discount before tax", () => {
    const line = computeLineTax({ quantity: "1000", rate: "145.50", discountPercent: "2.5", gstRate: "18" }, "INTRA");
    expect(line).toMatchObject({
      gross: "145500.00",
      discount: "3637.50",
      taxable: "141862.50",
      // 141862.50 × 9% = 12767.625 → rounded half-up per component
      cgst: "12767.63",
      sgst: "12767.63",
      tax: "25535.26",
      total: "167397.76",
    });
  });

  it("rounds CGST and SGST separately, so their sum may differ from IGST by a paisa", () => {
    // 100.10 × 2.5% = 2.5025 → 2.50 each; 100.10 × 5% = 5.005 → 5.01
    const intra = computeLineTax({ quantity: "1", rate: "100.10", gstRate: "5" }, "INTRA");
    const inter = computeLineTax({ quantity: "1", rate: "100.10", gstRate: "5" }, "INTER");
    expect([intra.cgst, intra.sgst, intra.tax, intra.cgstRate]).toEqual(["2.50", "2.50", "5.00", "2.5"]);
    expect([inter.igst, inter.tax]).toEqual(["5.01", "5.01"]);
  });

  it("rounds quantity × rate half-up to the paisa", () => {
    expect(computeLineTax({ quantity: "0.333", rate: "10.01" }, "INTRA").gross).toBe("3.33"); // 3.33333
    expect(computeLineTax({ quantity: "1.5", rate: "0.05" }, "INTRA").gross).toBe("0.08"); // 0.075
    expect(computeLineTax({ quantity: "3", rate: "33.33" }, "INTRA").gross).toBe("99.99");
    // A discount that lands on half a paisa: 0.75 × 10% = 0.075 → 0.08
    expect(computeLineTax({ quantity: "1", rate: "0.75", discountPercent: "10" }, "INTRA")).toMatchObject({
      discount: "0.08",
      taxable: "0.67",
    });
  });

  it("handles zero-rated lines, lines without a rate and full discounts", () => {
    expect(computeLineTax({ quantity: "5", rate: "20", gstRate: "0" }, "INTRA")).toMatchObject({
      taxable: "100.00",
      tax: "0.00",
      cgstRate: "0",
      total: "100.00",
    });
    expect(computeLineTax({ quantity: "5", rate: null, gstRate: "18" }, "INTER")).toMatchObject({
      gross: "0.00",
      tax: "0.00",
      total: "0.00",
    });
    expect(computeLineTax({ quantity: "5", rate: "20", discountPercent: "100", gstRate: "18" }, "INTRA")).toMatchObject({
      discount: "100.00",
      taxable: "0.00",
      total: "0.00",
    });
  });

  it("gives fractional half rates exactly", () => {
    expect(computeLineTax({ quantity: "1", rate: "1000", gstRate: "0.25" }, "INTRA")).toMatchObject({
      cgstRate: "0.125",
      cgst: "1.25",
      sgst: "1.25",
    });
    expect(computeLineTax({ quantity: "1", rate: "1000", gstRate: "12" }, "INTRA").cgstRate).toBe("6");
  });

  it("prices alternate-unit lines per entered unit, or per rate unit with a factor", () => {
    // Entered as 2 BOX at ₹240 per BOX.
    expect(computeLineTax({ quantity: "2", rate: "240", gstRate: "18" }, "INTRA").taxable).toBe("480.00");
    // Received as 30 PCS against ₹240 per BOX of 24 PCS: 30 / 24 × 240 = 300.
    expect(computeLineTax({ quantity: "30", rate: "240", rateFactor: "24" }, "INTRA").gross).toBe("300.00");
    // 10 PCS at ₹100 per BOX of 24: 41.666… → 41.67 (never via an inexact 0.417 BOX).
    expect(computeLineTax({ quantity: "10", rate: "100", rateFactor: "24" }, "INTRA").gross).toBe("41.67");
    // A full delivery values exactly like the order line.
    expect(computeLineTax({ quantity: "48", rate: "240", rateFactor: "24" }, "INTRA").gross).toBe("480.00");
  });
});

describe("computeTax", () => {
  it("sums rounded line values and adds untaxed other charges", () => {
    const summary = computeTax({
      taxType: "INTRA",
      otherCharges: "2500",
      lines: [
        { quantity: "1000", rate: "145.50", discountPercent: "2.5", gstRate: "18" },
        { quantity: "1", rate: "100.10", gstRate: "5" },
      ],
    });
    expect(summary).toMatchObject({
      taxType: "INTRA",
      subtotal: "145600.10",
      discount: "3637.50",
      taxable: "141962.60",
      cgst: "12770.13",
      sgst: "12770.13",
      igst: "0.00",
      tax: "25540.26",
      otherCharges: "2500.00",
      grandTotal: "170002.86",
    });
    expect(summary.lines).toHaveLength(2);
  });

  it("computes the same document inter-state", () => {
    const summary = computeTax({
      taxType: "INTER",
      lines: [
        { quantity: "1000", rate: "145.50", discountPercent: "2.5", gstRate: "18" },
        { quantity: "1", rate: "100.10", gstRate: "5" },
      ],
    });
    expect(summary).toMatchObject({ cgst: "0.00", sgst: "0.00", igst: "25540.26", otherCharges: "0.00", grandTotal: "167502.86" });
  });

  it("counts blank or half-typed numbers as zero (live form totals)", () => {
    const summary = computeTax({
      taxType: "INTRA",
      otherCharges: "",
      lines: [
        { quantity: "", rate: "10", gstRate: "18" },
        { quantity: "2", rate: "10.", discountPercent: "", gstRate: "" },
      ],
    });
    expect(summary).toMatchObject({ subtotal: "20.00", tax: "0.00", grandTotal: "20.00" });
  });

  it("is zero for an empty document", () => {
    expect(computeTax({ taxType: "INTER", lines: [] })).toMatchObject({ grandTotal: "0.00", lines: [] });
  });
});

describe("resolveTaxType", () => {
  it("is intra-state for the same state and inter-state otherwise", () => {
    expect(resolveTaxType("29", "29")).toEqual({ taxType: "INTRA", statesKnown: true });
    expect(resolveTaxType("29", "27")).toEqual({ taxType: "INTER", statesKnown: true });
  });

  it("falls back to intra-state when either state is unknown", () => {
    expect(resolveTaxType(null, "27")).toEqual({ taxType: "INTRA", statesKnown: false });
    expect(resolveTaxType("29", undefined)).toEqual({ taxType: "INTRA", statesKnown: false });
    expect(resolveTaxType("", "")).toEqual({ taxType: "INTRA", statesKnown: false });
  });
});
