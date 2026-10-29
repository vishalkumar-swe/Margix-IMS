import { describe, expect, it } from "vitest";
import {
  calculateGs1CheckDigit,
  calculateIsbn10CheckDigit,
  calculateIssnCheckDigit,
  cleanCode39,
  ean13ToIssn,
  extractGtin14Inner,
  isbn10To13,
  isbn13To10,
  issnToEan13,
  parseGs1Date,
  parseScannedBarcode,
  validateGs1CheckDigit,
  validateIsbn10,
  validateIssn,
  validatePzn,
} from "@/lib/industrial-barcode";

describe("Industrial & Universal Barcode Parser & Symbology Engine", () => {
  it("parses GS1 YYMMDD date format into ISO date strings", () => {
    expect(parseGs1Date("261231")).toBe("2026-12-31");
    expect(parseGs1Date("250600")).toBe("2025-06-30"); // Day 00 = end of month
    expect(parseGs1Date("240200")).toBe("2024-02-29"); // Leap year end of Feb
    expect(parseGs1Date("invalid")).toBeUndefined();
  });

  // 1. EAN & EAN-13
  it("identifies and validates standard EAN-13 retail barcodes", () => {
    const res = parseScannedBarcode("8901052000517");
    expect(res.code).toBe("8901052000517");
    expect(res.symbology).toBe("EAN-13");
    expect(res.identifierType).toBe("gtin");
    expect(res.checkDigitValid).toBe(true);
    expect(res.secondaryCodes).toContain("08901052000517");
  });

  // 2. UPC-A & UPC
  it("identifies and validates 12-digit UPC-A barcodes and computes equivalent EAN-13", () => {
    const rawUpc = "012345678905";
    const res = parseScannedBarcode(rawUpc);
    expect(res.code).toBe(rawUpc);
    expect(res.symbology).toBe("UPC-A");
    expect(res.identifierType).toBe("gtin");
    expect(res.checkDigitValid).toBe(true);
    expect(res.secondaryCodes).toContain("0012345678905"); // Equivalent 13-digit EAN
    expect(res.secondaryCodes).toContain("00012345678905"); // Equivalent 14-digit GTIN
  });

  // 3. EAN-8
  it("identifies and validates 8-digit EAN-8 compact retail barcodes", () => {
    const res = parseScannedBarcode("96385074");
    expect(res.code).toBe("96385074");
    expect(res.symbology).toBe("EAN-8");
    expect(res.identifierType).toBe("gtin");
    expect(res.checkDigitValid).toBe(true);
  });

  // 4. CODE-39
  it("handles Code-39 barcodes with and without enclosing asterisks", () => {
    const withAsterisks = parseScannedBarcode("*SKF-6205-2RSH*");
    expect(withAsterisks.code).toBe("SKF-6205-2RSH");
    expect(withAsterisks.symbology).toBe("CODE-39");
    expect(withAsterisks.identifierType).toBe("mpn");
    expect(withAsterisks.secondaryCodes).toContain("*SKF-6205-2RSH*");

    const bareCode39 = parseScannedBarcode("BOSCH-0445-110");
    expect(bareCode39.code).toBe("BOSCH-0445-110");
    expect(bareCode39.symbology).toBe("CODE-39");

    const helper = cleanCode39("*PART-123*");
    expect(helper.cleaned).toBe("PART-123");
    expect(helper.hadAsterisks).toBe(true);
  });

  // 5. GS1 / GS1-128 / GS1 DataMatrix
  it("parses bracketed GS1-128 / GS1 DataMatrix with GTIN, Batch, Expiry, Serial and Quantity", () => {
    const raw = "(01)08901058862492(17)261231(10)LOT7788(21)SN10001(30)24";
    const res = parseScannedBarcode(raw);

    expect(res.isComposite).toBe(true);
    expect(res.code).toBe("8901058862492");
    expect(res.gtin).toBe("8901058862492");
    expect(res.symbology).toBe("GS1-128");
    expect(res.expiryDate).toBe("2026-12-31");
    expect(res.batchNumber).toBe("LOT7788");
    expect(res.serialNumber).toBe("SN10001");
    expect(res.quantity).toBe(24);
  });

  it("parses GS1 Digital Link URLs", () => {
    const url = "https://id.gs1.org/01/08906003920042/10/B123?17=270531&21=SER999";
    const res = parseScannedBarcode(url);

    expect(res.isComposite).toBe(true);
    expect(res.code).toBe("8906003920042");
    expect(res.symbology).toBe("GS1-DATAMATRIX");
    expect(res.batchNumber).toBe("B123");
    expect(res.expiryDate).toBe("2027-05-31");
    expect(res.serialNumber).toBe("SER999");
  });

  // 6. GTIN & GTIN-14 (ITF-14)
  it("identifies GTIN-14 outer carton barcodes and extracts inner consumer item EAN-13", () => {
    // 14 digits starting with 1 (case level), e.g. 1 890123456789 7
    const gtin14 = "18901234567897";
    const res = parseScannedBarcode(gtin14);

    expect(res.code).toBe(gtin14);
    expect(res.symbology).toBe("GTIN-14");
    expect(res.identifierType).toBe("gtin");
    expect(res.packagingLevel).toBe("inner_pack");
    expect(res.innerGtin).toBe("8901234567890");
    expect(res.secondaryCodes).toContain("8901234567890"); // Inner consumer code available for 1-click matching

    const innerExtract = extractGtin14Inner(gtin14);
    expect(innerExtract?.innerEan13).toBe("8901234567890");
  });

  // 7. ISBN / ISBN-10 / ISBN-13
  it("identifies ISBN-13 and converts to ISBN-10", () => {
    const rawIsbn13 = "9780132350884";
    const res = parseScannedBarcode(rawIsbn13);

    expect(res.code).toBe("9780132350884");
    expect(res.symbology).toBe("ISBN-13");
    expect(res.identifierType).toBe("isbn");
    expect(res.checkDigitValid).toBe(true);
    expect(res.isbn10).toBe("0132350882");
    expect(res.secondaryCodes).toContain("0132350882");
    expect(isbn13To10(rawIsbn13)).toBe("0132350882");
  });

  it("identifies ISBN-10, validates check digit, and converts to ISBN-13", () => {
    const rawIsbn10 = "0-13-235088-2";
    const res = parseScannedBarcode(rawIsbn10);

    expect(res.code).toBe("9780132350884"); // Normalized to standard 13-digit ISBN
    expect(res.symbology).toBe("ISBN-10");
    expect(res.identifierType).toBe("isbn");
    expect(res.isbn10).toBe("0132350882");
    expect(res.checkDigitValid).toBe(true);
    expect(res.secondaryCodes).toContain("0132350882");
    expect(isbn10To13(rawIsbn10)).toBe("9780132350884");
    expect(validateIsbn10("0132350882")).toBe(true);
  });

  // 8. ISSN (Journals, Periodicals, Newspapers)
  it("identifies 8-character ISSN, validates check digit, and converts to 977 EAN-13", () => {
    const rawIssn = "0362-4331"; // The New York Times
    const res = parseScannedBarcode(rawIssn);

    expect(res.code).toBe("0362-4331");
    expect(res.symbology).toBe("ISSN");
    expect(res.identifierType).toBe("issn");
    expect(res.checkDigitValid).toBe(true);
    expect(res.gtin).toBe("9770362433006");
    expect(res.secondaryCodes).toContain("9770362433006");

    expect(validateIssn("03624331")).toBe(true);
    expect(issnToEan13("0362-4331")).toBe("9770362433006");
  });

  it("identifies 977-prefixed EAN-13 and extracts 8-character ISSN", () => {
    const rawEan = "9770362433006";
    const res = parseScannedBarcode(rawEan);

    expect(res.code).toBe("9770362433006");
    expect(res.symbology).toBe("ISSN");
    expect(res.identifierType).toBe("issn");
    expect(res.issn).toBe("0362-4331");
    expect(res.secondaryCodes).toContain("0362-4331");
    expect(ean13ToIssn(rawEan)).toBe("0362-4331");
  });

  // 9. JAN (Japanese Article Number)
  it("identifies JAN codes starting with 45 and 49", () => {
    const janSony = "4905524985870"; // Sony electronics
    const res = parseScannedBarcode(janSony);

    expect(res.code).toBe(janSony);
    expect(res.symbology).toBe("JAN");
    expect(res.identifierType).toBe("jan");
    expect(res.jan).toBe(janSony);
    expect(res.checkDigitValid).toBe(true);

    const janShort = "45123456"; // 8-digit JAN
    const resShort = parseScannedBarcode(janShort);
    expect(resShort.symbology).toBe("JAN");
  });

  // 10. PZN (Pharma-Zentral-Nummer)
  it("identifies German PZN pharmaceutical codes with Modulo 11 check digit", () => {
    // Valid PZN: 1000001 (1*1 = 1 mod 11 = 1)
    const prefixed = parseScannedBarcode("PZN-1000001");
    expect(prefixed.code).toBe("PZN-1000001");
    expect(prefixed.symbology).toBe("PZN");
    expect(prefixed.identifierType).toBe("pzn");
    expect(prefixed.checkDigitValid).toBe(true);
    expect(prefixed.secondaryCodes).toContain("1000001");

    // Code-39 minus format: -1000001
    const minusPzn = parseScannedBarcode("-1000001");
    expect(minusPzn.code).toBe("PZN-1000001");
    expect(minusPzn.symbology).toBe("PZN");

    // Asterisk Code-39: *PZN-1000001*
    const starPzn = parseScannedBarcode("*PZN-1000001*");
    expect(starPzn.code).toBe("PZN-1000001");
    expect(starPzn.symbology).toBe("PZN");

    expect(validatePzn("1000001")).toBe(true);
    expect(validatePzn("1000002")).toBe(false);
  });

  // 11. Amazon ASIN & FNSKU
  it("identifies Amazon ASIN from bare code, prefix, or product URL", () => {
    const bare = parseScannedBarcode("B08N5WRWNW");
    expect(bare.code).toBe("B08N5WRWNW");
    expect(bare.asin).toBe("B08N5WRWNW");
    expect(bare.symbology).toBe("ASIN");
    expect(bare.identifierType).toBe("asin");

    const prefixed = parseScannedBarcode("ASIN: B07XJ8C8F5");
    expect(prefixed.code).toBe("B07XJ8C8F5");
    expect(prefixed.asin).toBe("B07XJ8C8F5");

    const url = parseScannedBarcode("https://www.amazon.in/dp/B08N5WRWNW?ref=nb_sb_noss");
    expect(url.code).toBe("B08N5WRWNW");
    expect(url.asin).toBe("B08N5WRWNW");
  });

  it("identifies Amazon FNSKU codes", () => {
    const fnsku = parseScannedBarcode("X0023ABC99");
    expect(fnsku.code).toBe("X0023ABC99");
    expect(fnsku.fnsku).toBe("X0023ABC99");
    expect(fnsku.symbology).toBe("FNSKU");
    expect(fnsku.identifierType).toBe("fnsku");
  });

  // 12. Checksum calculations
  it("verifies mathematical GS1, ISBN, and ISSN checksum implementations", () => {
    expect(calculateGs1CheckDigit("890105200051")).toBe(7);
    expect(validateGs1CheckDigit("8901052000517")).toBe(true);
    expect(validateGs1CheckDigit("8901052000518")).toBe(false);

    expect(calculateIsbn10CheckDigit("013235088")).toBe("2");
    expect(calculateIssnCheckDigit("0362433")).toBe("1");
  });
});
