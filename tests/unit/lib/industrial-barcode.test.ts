import { describe, expect, it } from "vitest";
import { parseGs1Date, parseScannedBarcode } from "@/lib/industrial-barcode";

describe("Industrial & Universal Barcode Parser", () => {
  it("parses GS1 YYMMDD date format into ISO date strings", () => {
    expect(parseGs1Date("261231")).toBe("2026-12-31");
    expect(parseGs1Date("250600")).toBe("2025-06-30"); // Day 00 = end of month
    expect(parseGs1Date("240200")).toBe("2024-02-29"); // Leap year end of Feb
    expect(parseGs1Date("invalid")).toBeUndefined();
  });

  it("parses bracketed GS1-128 / GS1 DataMatrix with GTIN, Batch, Expiry, and Serial", () => {
    const raw = "(01)08901058862492(17)261231(10)LOT7788(21)SN10001";
    const res = parseScannedBarcode(raw);

    expect(res.isComposite).toBe(true);
    expect(res.code).toBe("8901058862492");
    expect(res.gtin).toBe("8901058862492");
    expect(res.expiryDate).toBe("2026-12-31");
    expect(res.batchNumber).toBe("LOT7788");
    expect(res.serialNumber).toBe("SN10001");
  });

  it("parses GS1 Digital Link URLs", () => {
    const url = "https://id.gs1.org/01/08906003920042/10/B123?17=270531&21=SER999";
    const res = parseScannedBarcode(url);

    expect(res.isComposite).toBe(true);
    expect(res.code).toBe("8906003920042");
    expect(res.batchNumber).toBe("B123");
    expect(res.expiryDate).toBe("2027-05-31");
    expect(res.serialNumber).toBe("SER999");
  });

  it("parses raw GS1-128 starting with 01 without brackets", () => {
    const raw = "01089014160010181728103110BATCH99";
    const res = parseScannedBarcode(raw);

    expect(res.code).toBe("8901416001018");
    expect(res.gtin).toBe("8901416001018");
    expect(res.expiryDate).toBe("2028-10-31");
    expect(res.batchNumber).toBe("BATCH99");
  });

  it("parses Automotive / Defense ISO 15434 Part Marking", () => {
    const raw = "[)>*06:1P-SKF-6205-2RSH:1T-LOT-5544:Q50*";
    const res = parseScannedBarcode(raw);

    expect(res.isComposite).toBe(true);
    expect(res.code).toBe("-SKF-6205-2RSH");
    expect(res.batchNumber).toBe("-LOT-5544");
    expect(res.quantity).toBe(50);
  });

  it("strips noisy industrial part number prefixes", () => {
    const p1 = parseScannedBarcode("P/N: BOSCH-0445110");
    expect(p1.code).toBe("BOSCH-0445110");

    const p2 = parseScannedBarcode("PART NO: 3RV2011-1AA10");
    expect(p2.code).toBe("3RV2011-1AA10");
  });

  it("handles standard retail EAN, UPC, and clean Code 128 / Code 39", () => {
    const ean = parseScannedBarcode("8901052000516");
    expect(ean.code).toBe("8901052000516");
    expect(ean.isComposite).toBe(false);

    const part = parseScannedBarcode("IRF540N");
    expect(part.code).toBe("IRF540N");
  });
});

