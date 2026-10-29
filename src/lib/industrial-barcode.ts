/**
 * Industrial & Universal Barcode Parser & Symbology Engine
 * 
 * Comprehensive support for all global barcode symbologies and product identifier formats:
 * - EAN: Standard European/International Article Number (EAN-13, EAN-8)
 * - UPC-A: Universal Product Code (12 digits, North America)
 * - CODE-39: Industrial, Automotive & Defense 1D barcode (with asterisk stripping & mod 43)
 * - EAN-13: 13-digit Global Trade Item Number (GTIN-13, GS1 India 890, etc.)
 * - EAN-8: 8-digit compact retail barcode for small packages
 * - GS1: GS1-128 & GS1 DataMatrix with Application Identifiers (AI 01, 10, 17, 11, 15, 21, 30, 310x, 00, 240, 710)
 * - GTIN: Global Trade Item Number (8, 12, 13, 14 digits)
 * - GTIN-14: ITF-14 / Outer Corrugated Cartons & Shipping Containers (extracts inner item code)
 * - ISBN / ISBN-10 / ISBN-13: International Standard Book Number (Bookland 978/979 & Modulo 11 check digit)
 * - ISSN: International Standard Serial Number for journals/periodicals (8-digit & 977 EAN-13)
 * - JAN: Japanese Article Number (GS1 Japan prefixes 45 and 49)
 * - PZN: Pharma-Zentral-Nummer (German/EU pharmaceutical & medical device Modulo 11 identifier)
 * - UPC: UPC-A and UPC-E retail codes
 * - ASIN / FNSKU: Amazon marketplace identifiers
 * - Industrial Part Numbers (MPN, Automotive, MIL-STD-129, ISO/IEC 15434)
 */

export type BarcodeSymbology =
  | "EAN-13"
  | "UPC-A"
  | "CODE-39"
  | "EAN-8"
  | "GS1-128"
  | "GS1-DATAMATRIX"
  | "GTIN-14"
  | "ISBN-13"
  | "ISBN-10"
  | "ISSN"
  | "JAN"
  | "PZN"
  | "ASIN"
  | "FNSKU"
  | "CODE-128"
  | "ITF-14"
  | "CUSTOM";

export type IdentifierType =
  | "gtin"
  | "asin"
  | "isbn"
  | "issn"
  | "jan"
  | "pzn"
  | "fnsku"
  | "mpn"
  | "custom";

export interface ParsedIndustrialBarcode {
  raw: string;
  code: string; // Primary lookup code (GTIN, SKU, ASIN, ISBN, or clean Part Number)
  primaryCode: string; // Alias to code for convenience
  secondaryCodes: string[]; // Alternate representations (e.g. 14-digit GTIN vs 13-digit EAN, raw vs stripped)
  isComposite: boolean;
  symbology?: BarcodeSymbology;
  identifierType?: IdentifierType;
  checkDigitValid?: boolean;
  gtin?: string;
  asin?: string;
  isbn?: string;
  isbn10?: string;
  isbn13?: string;
  issn?: string;
  jan?: string;
  pzn?: string;
  fnsku?: string;
  partNumber?: string;
  innerGtin?: string; // For GTIN-14 outer cases: base consumer unit code
  packagingLevel?: "consumer_unit" | "inner_pack" | "outer_case" | "pallet";
  batchNumber?: string;
  expiryDate?: string; // YYYY-MM-DD
  manufacturingDate?: string; // YYYY-MM-DD
  productionDate?: string; // Alias to manufacturingDate
  serialNumber?: string;
  quantity?: number;
  weightKg?: number;
  sscc?: string;
}

// ==========================================
// Check Digit Validation & Math Helpers
// ==========================================

/** Calculates GS1 Modulo 10 check digit for any length (EAN-13, UPC-A, EAN-8, GTIN-14, SSCC) */
export function calculateGs1CheckDigit(digits: string): number {
  let sum = 0;
  const len = digits.length;
  for (let i = 0; i < len; i++) {
    const d = parseInt(digits[len - 1 - i], 10);
    const weight = i % 2 === 0 ? 3 : 1;
    sum += d * weight;
  }
  return (10 - (sum % 10)) % 10;
}

/** Validates GS1 Modulo 10 check digit for standard GTINs */
export function validateGs1CheckDigit(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$|^\d{18}$/.test(code)) return false;
  const body = code.slice(0, -1);
  const check = parseInt(code.slice(-1), 10);
  return calculateGs1CheckDigit(body) === check;
}

/** Calculates ISBN-10 Modulo 11 check digit (returns '0'-'9' or 'X') */
export function calculateIsbn10CheckDigit(digits9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * parseInt(digits9[i], 10);
  }
  const rem = (11 - (sum % 11)) % 11;
  return rem === 10 ? "X" : String(rem);
}

/** Validates ISBN-10 Modulo 11 check digit */
export function validateIsbn10(isbn10: string): boolean {
  const clean = isbn10.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (clean.length !== 10) return false;
  const body = clean.slice(0, 9);
  const check = clean.slice(9);
  return calculateIsbn10CheckDigit(body) === check;
}

/** Converts ISBN-10 to 13-digit ISBN-13 (Bookland 978 prefix) */
export function isbn10To13(isbn10: string): string {
  const clean9 = isbn10.replace(/[^0-9Xx]/g, "").slice(0, 9);
  const base12 = "978" + clean9;
  return base12 + calculateGs1CheckDigit(base12);
}

/** Converts 13-digit ISBN-13 to 10-digit ISBN-10 (if starting with 978) */
export function isbn13To10(isbn13: string): string | null {
  const clean = isbn13.replace(/[^0-9]/g, "");
  if (clean.length !== 13 || !clean.startsWith("978")) return null;
  const base9 = clean.slice(3, 12);
  return base9 + calculateIsbn10CheckDigit(base9);
}

/** Calculates ISSN Modulo 11 check digit (returns '0'-'9' or 'X') */
export function calculateIssnCheckDigit(digits7: string): string {
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += (8 - i) * parseInt(digits7[i], 10);
  }
  const rem = (11 - (sum % 11)) % 11;
  return rem === 10 ? "X" : String(rem);
}

/** Validates ISSN Modulo 11 check digit */
export function validateIssn(issn: string): boolean {
  const clean = issn.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (clean.length !== 8) return false;
  const body = clean.slice(0, 7);
  const check = clean.slice(7);
  return calculateIssnCheckDigit(body) === check;
}

/** Converts ISSN (e.g. 0362-4331) to 13-digit EAN-13 (977...) */
export function issnToEan13(issn: string, variant = "00"): string {
  const clean7 = issn.replace(/[^0-9Xx]/g, "").slice(0, 7);
  const base12 = "977" + clean7 + variant;
  return base12 + calculateGs1CheckDigit(base12);
}

/** Converts 13-digit EAN-13 starting with 977 to standard 8-char ISSN (XXXX-XXXX) */
export function ean13ToIssn(ean: string): string | null {
  const clean = ean.replace(/[^0-9]/g, "");
  if (clean.length !== 13 || !clean.startsWith("977")) return null;
  const base7 = clean.slice(3, 10);
  const cd = calculateIssnCheckDigit(base7);
  return `${base7.slice(0, 4)}-${base7.slice(4)}${cd}`;
}

/** Validates German/EU Pharma-Zentral-Nummer (PZN) using Modulo 11 */
export function validatePzn(pzn: string): boolean {
  const digits = pzn.replace(/[^0-9]/g, "");
  if (digits.length !== 7 && digits.length !== 8) return false;
  let sum = 0;
  const dataLen = digits.length - 1;
  for (let i = 0; i < dataLen; i++) {
    sum += (i + 1) * parseInt(digits[i], 10);
  }
  const expected = sum % 11;
  if (expected === 10) return false;
  return expected === parseInt(digits[dataLen], 10);
}

/** Extracts inner base consumer item GTIN from GTIN-14 outer carton */
export function extractGtin14Inner(gtin14: string): {
  innerEan13: string;
  innerUpcA?: string;
  packagingLevel: "consumer_unit" | "inner_pack" | "outer_case" | "pallet";
  indicatorDigit: number;
} | null {
  const clean = gtin14.replace(/[^0-9]/g, "");
  if (clean.length !== 14) return null;
  const indicator = parseInt(clean[0], 10);
  const base12 = clean.slice(1, 13);
  const innerEan13Check = calculateGs1CheckDigit(base12);
  const innerEan13 = base12 + innerEan13Check;
  const innerUpcA = base12.startsWith("0") ? base12.slice(1) : undefined;

  let packagingLevel: "consumer_unit" | "inner_pack" | "outer_case" | "pallet" = "outer_case";
  if (indicator === 0) packagingLevel = "consumer_unit";
  else if (indicator === 1) packagingLevel = "inner_pack";
  else if (indicator >= 2 && indicator <= 7) packagingLevel = "outer_case";
  else if (indicator === 8) packagingLevel = "pallet";

  return { innerEan13, innerUpcA, packagingLevel, indicatorDigit: indicator };
}

/** Strips Code-39 start/stop delimiters '*' if present */
export function cleanCode39(raw: string): { cleaned: string; hadAsterisks: boolean } {
  const trimmed = raw.trim();
  if (trimmed.length >= 3 && trimmed.startsWith("*") && trimmed.endsWith("*")) {
    return { cleaned: trimmed.slice(1, -1).trim(), hadAsterisks: true };
  }
  return { cleaned: trimmed, hadAsterisks: false };
}

/** Parses GS1 YYMMDD date format into YYYY-MM-DD */
export function parseGs1Date(yymmdd: string): string | undefined {
  if (!/^\d{6}$/.test(yymmdd)) return undefined;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  let dd = yymmdd.slice(4, 6);

  // In GS1 standard: if day is 00, it denotes the last day of the month
  if (dd === "00") {
    const yearFull = yy >= 50 ? 1900 + yy : 2000 + yy;
    const monthNum = parseInt(mm, 10);
    const lastDay = new Date(yearFull, monthNum, 0).getDate();
    dd = String(lastDay).padStart(2, "0");
  }

  const century = yy >= 50 ? "19" : "20";
  return `${century}${yymmdd.slice(0, 2)}-${mm}-${dd}`;
}

type ParsedRaw = Omit<ParsedIndustrialBarcode, "primaryCode" | "secondaryCodes">;

function finalizeResult(
  res: ParsedRaw,
  raw: string,
): ParsedIndustrialBarcode {
  const primaryCode = res.code || raw;
  const secondarySet = new Set<string>();

  if (res.gtin) {
    secondarySet.add(res.gtin);
    if (res.gtin.length === 14 && res.gtin.startsWith("0")) {
      secondarySet.add(res.gtin.slice(1));
    } else if (res.gtin.length === 13) {
      secondarySet.add("0" + res.gtin);
      if (res.gtin.startsWith("0")) {
        secondarySet.add(res.gtin.slice(1)); // 12-digit UPC-A
      }
    } else if (res.gtin.length === 12) {
      secondarySet.add("0" + res.gtin); // 13-digit EAN
      secondarySet.add("00" + res.gtin); // 14-digit GTIN
    }
  }

  if (res.innerGtin) secondarySet.add(res.innerGtin);
  if (res.asin) secondarySet.add(res.asin);
  if (res.isbn) secondarySet.add(res.isbn);
  if (res.isbn10) secondarySet.add(res.isbn10);
  if (res.isbn13) secondarySet.add(res.isbn13);
  if (res.issn) secondarySet.add(res.issn);
  if (res.jan) secondarySet.add(res.jan);
  if (res.pzn) {
    secondarySet.add(res.pzn);
    const cleanDigits = res.pzn.replace(/[^0-9]/g, "");
    secondarySet.add(cleanDigits);
    secondarySet.add(`PZN-${cleanDigits}`);
  }
  if (res.fnsku) secondarySet.add(res.fnsku);
  if (res.partNumber) secondarySet.add(res.partNumber);
  if (primaryCode !== raw && raw) secondarySet.add(raw);
  secondarySet.delete(primaryCode);

  return {
    ...res,
    primaryCode,
    productionDate: res.manufacturingDate,
    secondaryCodes: [...secondarySet],
  };
}

/**
 * Universal Scanner Parser:
 * Resolves EAN, UPC-A, CODE-39, EAN-13, EAN-8, GS1, GTIN, GTIN-14, ISBN, ISBN-10, ISBN-13, ISSN, JAN, PZN, UPC
 */
export function parseScannedBarcode(rawInput: string): ParsedIndustrialBarcode {
  const raw = rawInput.trim();
  if (!raw) {
    return finalizeResult({ raw: "", code: "", isComposite: false }, "");
  }

  return finalizeResult(rawParseScannedBarcode(raw), raw);
}

function rawParseScannedBarcode(raw: string): Omit<ParsedIndustrialBarcode, "primaryCode" | "secondaryCodes"> {
  // Step 0: Check Code 39 Asterisks delimiter (e.g. *SKF-6205* or *PZN-12345678*)
  const code39Cleaned = cleanCode39(raw);
  const workingStr = code39Cleaned.cleaned;
  const isFromCode39 = code39Cleaned.hadAsterisks;

  // Step 1: GS1 Digital Link URI e.g. https://id.gs1.org/01/08901234567890/10/BATCH123?17=261231
  if (/^https?:\/\//i.test(workingStr)) {
    try {
      const url = new URL(workingStr);
      const segments = url.pathname.split("/").filter(Boolean);
      const result: ParsedRaw = {
        raw,
        code: "",
        isComposite: true,
        symbology: "GS1-DATAMATRIX",
      };

      for (let i = 0; i < segments.length; i += 2) {
        const ai = segments[i];
        const val = segments[i + 1];
        if (!val) continue;

        if (ai === "01") {
          result.gtin = val.length === 14 && val.startsWith("0") ? val.slice(1) : val;
          result.code = result.gtin;
          result.identifierType = "gtin";
        } else if (ai === "10") {
          result.batchNumber = val;
        } else if (ai === "17") {
          result.expiryDate = parseGs1Date(val);
        } else if (ai === "11") {
          result.manufacturingDate = parseGs1Date(val);
        } else if (ai === "21") {
          result.serialNumber = val;
        } else if (ai === "00") {
          result.sscc = val;
        } else if (ai === "710") {
          result.pzn = val;
          result.symbology = "PZN";
          result.identifierType = "pzn";
        }
      }

      url.searchParams.forEach((val, key) => {
        if (key === "01" && !result.code) {
          result.gtin = val.length === 14 && val.startsWith("0") ? val.slice(1) : val;
          result.code = result.gtin;
          result.identifierType = "gtin";
        } else if (key === "10") {
          result.batchNumber = val;
        } else if (key === "17") {
          result.expiryDate = parseGs1Date(val);
        } else if (key === "11") {
          result.manufacturingDate = parseGs1Date(val);
        } else if (key === "21") {
          result.serialNumber = val;
        }
      });

      if (result.code) {
        return result;
      }
    } catch {
      // Fall through if URL parsing fails
    }
  }

  // Step 2: Bracketed GS1 Application Identifiers: e.g. (01)08901234567890(17)261231(10)LOT123
  const bracketMatches = [...workingStr.matchAll(/[\(\[](\d{2,4})[\)\]]([^\(\[]+)/g)];
  if (bracketMatches.length > 0) {
    const result: ParsedRaw = {
      raw,
      code: "",
      isComposite: true,
      symbology: "GS1-128",
    };

    for (const match of bracketMatches) {
      const ai = match[1];
      const val = match[2].trim();

      if (ai === "01" || ai === "02") {
        result.gtin = val.length === 14 && val.startsWith("0") ? val.slice(1) : val;
        result.code = result.gtin;
        result.identifierType = "gtin";
      } else if (ai === "10") {
        result.batchNumber = val;
      } else if (ai === "17") {
        result.expiryDate = parseGs1Date(val);
      } else if (ai === "11") {
        result.manufacturingDate = parseGs1Date(val);
      } else if (ai === "21") {
        result.serialNumber = val;
      } else if (ai === "30") {
        result.quantity = parseInt(val, 10) || undefined;
      } else if (ai.startsWith("310")) {
        const decimals = parseInt(ai.charAt(3), 10) || 0;
        result.weightKg = parseFloat(val) / Math.pow(10, decimals);
      } else if (ai === "00") {
        result.sscc = val;
      } else if (ai === "240") {
        result.partNumber = val;
        if (!result.code) result.code = val;
      } else if (ai === "710") {
        result.pzn = val;
        result.symbology = "PZN";
        result.identifierType = "pzn";
        if (!result.code) result.code = `PZN-${val}`;
      }
    }

    if (result.code) {
      return result;
    }
  }

  // Step 3: Raw GS1-128 / DataMatrix starting with 01 (GTIN-14)
  if (/^01\d{14}/.test(workingStr)) {
    const gtin14 = workingStr.slice(2, 16);
    const cleanGtin = gtin14.startsWith("0") ? gtin14.slice(1) : gtin14;
    let remainder = workingStr.slice(16);

    const result: ParsedRaw = {
      raw,
      code: cleanGtin,
      gtin: cleanGtin,
      symbology: "GS1-128",
      identifierType: "gtin",
      isComposite: remainder.length > 0,
    };

    while (remainder.length > 0) {
      if (remainder.startsWith("\x1d")) {
        remainder = remainder.slice(1);
        continue;
      }
      if (remainder.startsWith("17") && remainder.length >= 8) {
        result.expiryDate = parseGs1Date(remainder.slice(2, 8));
        remainder = remainder.slice(8);
      } else if (remainder.startsWith("11") && remainder.length >= 8) {
        result.manufacturingDate = parseGs1Date(remainder.slice(2, 8));
        remainder = remainder.slice(8);
      } else if (remainder.startsWith("10") && remainder.length >= 3) {
        const fncIdx = remainder.indexOf("\x1d");
        if (fncIdx !== -1) {
          result.batchNumber = remainder.slice(2, fncIdx);
          remainder = remainder.slice(fncIdx + 1);
        } else {
          result.batchNumber = remainder.slice(2);
          remainder = "";
        }
      } else if (remainder.startsWith("21") && remainder.length >= 3) {
        const fncIdx = remainder.indexOf("\x1d");
        if (fncIdx !== -1) {
          result.serialNumber = remainder.slice(2, fncIdx);
          remainder = remainder.slice(fncIdx + 1);
        } else {
          result.serialNumber = remainder.slice(2);
          remainder = "";
        }
      } else {
        break;
      }
    }

    return result;
  }

  // Step 4: ISO/IEC 15434 Automotive / DoD UID Part Marking
  if (workingStr.startsWith("[)>") || workingStr.startsWith("[)><RS>")) {
    const fields = workingStr.split(/[\x1d\x1e:\*]/).filter(Boolean);
    const result: ParsedRaw = {
      raw,
      code: "",
      isComposite: true,
      symbology: "CUSTOM",
      identifierType: "mpn",
    };

    for (const f of fields) {
      if (f.startsWith("1P") || f.startsWith("P")) {
        result.partNumber = f.replace(/^1?P/, "").trim();
        result.code = result.partNumber;
      } else if (f.startsWith("1T") || f.startsWith("T") || f.startsWith("10T")) {
        result.batchNumber = f.replace(/^(?:10T|1T|T)/, "").trim();
      } else if (f.startsWith("S")) {
        result.serialNumber = f.replace(/^S/, "").trim();
      } else if (f.startsWith("Q")) {
        result.quantity = parseInt(f.replace(/^Q/, ""), 10) || undefined;
      }
    }

    if (result.code) {
      return result;
    }
  }

  // Step 5: Pharma-Zentral-Nummer (PZN) - German & EU Pharmaceutical Code
  // Formats: "PZN-12345678", "-12345678", "PZN: 12345678", or bare 7-8 digits with PZN check
  const pznPrefixMatch = workingStr.match(/^(?:pzn[\s:#-]+|[-])(\d{7,8})$/i);
  if (pznPrefixMatch) {
    const pznDigits = pznPrefixMatch[1];
    const isValid = validatePzn(pznDigits);
    return {
      raw,
      code: `PZN-${pznDigits}`,
      pzn: `PZN-${pznDigits}`,
      partNumber: pznDigits,
      symbology: "PZN",
      identifierType: "pzn",
      checkDigitValid: isValid,
      isComposite: false,
    };
  }

  // Step 6: ISSN (Serials, Periodicals & Newspapers)
  // Formats: "ISSN 0362-4331", "0362-4331", or EAN-13 starting with 977
  const issnPrefixMatch = workingStr.match(/^(?:issn)[\s:#]+([0-9Xx-]{8,9})$/i);
  if (issnPrefixMatch) {
    const clean8 = issnPrefixMatch[1].replace(/[^0-9Xx]/g, "").toUpperCase();
    if (clean8.length === 8) {
      const formatted = `${clean8.slice(0, 4)}-${clean8.slice(4)}`;
      const ean13 = issnToEan13(formatted);
      return {
        raw,
        code: formatted,
        issn: formatted,
        gtin: ean13,
        symbology: "ISSN",
        identifierType: "issn",
        checkDigitValid: validateIssn(clean8),
        isComposite: false,
      };
    }
  }
  if (/^\d{4}-\d{3}[\dX]$/i.test(workingStr)) {
    const clean8 = workingStr.replace(/[^0-9Xx]/g, "").toUpperCase();
    const formatted = `${clean8.slice(0, 4)}-${clean8.slice(4)}`;
    const ean13 = issnToEan13(formatted);
    return {
      raw,
      code: formatted,
      issn: formatted,
      gtin: ean13,
      symbology: "ISSN",
      identifierType: "issn",
      checkDigitValid: validateIssn(clean8),
      isComposite: false,
    };
  }
  if (/^977\d{10}$/.test(workingStr)) {
    const issn = ean13ToIssn(workingStr);
    return {
      raw,
      code: workingStr,
      gtin: workingStr,
      issn: issn ?? undefined,
      symbology: "ISSN",
      identifierType: "issn",
      checkDigitValid: validateGs1CheckDigit(workingStr),
      isComposite: false,
    };
  }

  // Step 7: ISBN (Books & Publications)
  // Formats: "ISBN 978-0-13-235088-4", "9780132350884", "0-13-235088-2"
  const isbnPrefixMatch = workingStr.match(/^(?:isbn|isbn-13|isbn-10)[\s:#]+([0-9Xx-]{10,17})$/i);
  if (isbnPrefixMatch) {
    const clean = isbnPrefixMatch[1].replace(/[^0-9Xx]/g, "").toUpperCase();
    if (clean.length === 13) {
      const isbn10 = isbn13To10(clean);
      return {
        raw,
        code: clean,
        isbn: clean,
        isbn13: clean,
        isbn10: isbn10 ?? undefined,
        gtin: clean,
        symbology: "ISBN-13",
        identifierType: "isbn",
        checkDigitValid: validateGs1CheckDigit(clean),
        isComposite: false,
      };
    }
    if (clean.length === 10) {
      const isbn13 = isbn10To13(clean);
      return {
        raw,
        code: isbn13,
        isbn: isbn13,
        isbn10: clean,
        isbn13,
        gtin: isbn13,
        symbology: "ISBN-10",
        identifierType: "isbn",
        checkDigitValid: validateIsbn10(clean),
        isComposite: false,
      };
    }
  }

  // Bare ISBN-13 (starts with 978 or 979)
  if (/^97[89]\d{10}$/.test(workingStr)) {
    const isbn10 = isbn13To10(workingStr);
    return {
      raw,
      code: workingStr,
      isbn: workingStr,
      isbn13: workingStr,
      isbn10: isbn10 ?? undefined,
      gtin: workingStr,
      symbology: "ISBN-13",
      identifierType: "isbn",
      checkDigitValid: validateGs1CheckDigit(workingStr),
      isComposite: false,
    };
  }

  // Hyphenated ISBN-10 (e.g. 0-13-235088-2)
  if (/^\d{1,5}-\d+-\d+-[\dX]$/i.test(workingStr)) {
    const clean10 = workingStr.replace(/[^0-9Xx]/g, "").toUpperCase();
    if (clean10.length === 10) {
      const isbn13 = isbn10To13(clean10);
      return {
        raw,
        code: isbn13,
        isbn: isbn13,
        isbn10: clean10,
        isbn13,
        gtin: isbn13,
        symbology: "ISBN-10",
        identifierType: "isbn",
        checkDigitValid: validateIsbn10(clean10),
        isComposite: false,
      };
    }
  }

  // Step 8: Amazon URLs: https://www.amazon.in/dp/B08N5WRWNW, https://amzn.in/d/..., etc.
  const amazonMatch = workingStr.match(/(?:amazon\.[a-z.]+\/(?:.*\/)?(?:dp|gp\/product)\/|amzn\.[a-z.]+\/d\/)([A-Z0-9]{10})/i);
  if (amazonMatch) {
    const asin = amazonMatch[1].toUpperCase();
    return {
      raw,
      code: asin,
      asin,
      partNumber: asin,
      symbology: "ASIN",
      identifierType: "asin",
      isComposite: false,
    };
  }

  // Step 9: Amazon ASIN: "ASIN: B08N5WRWNW" or bare "B0..." 10-char code
  const asinPrefixMatch = workingStr.match(/^(?:asin|amazon)[\s:#]+([A-Z0-9]{10})$/i);
  if (asinPrefixMatch) {
    const asin = asinPrefixMatch[1].toUpperCase();
    return {
      raw,
      code: asin,
      asin,
      partNumber: asin,
      symbology: "ASIN",
      identifierType: "asin",
      isComposite: false,
    };
  }
  if (/^B0[A-Z0-9]{8}$/i.test(workingStr)) {
    const asin = workingStr.toUpperCase();
    return {
      raw,
      code: asin,
      asin,
      partNumber: asin,
      symbology: "ASIN",
      identifierType: "asin",
      isComposite: false,
    };
  }

  // Step 10: Amazon FNSKU: "FNSKU: X001..." or bare "X0..."
  const fnskuPrefixMatch = workingStr.match(/^(?:fnsku)[\s:#]+([A-Z0-9]{10})$/i);
  if (fnskuPrefixMatch) {
    const fnsku = fnskuPrefixMatch[1].toUpperCase();
    return {
      raw,
      code: fnsku,
      fnsku,
      symbology: "FNSKU",
      identifierType: "fnsku",
      isComposite: false,
    };
  }
  if (/^X0[A-Z0-9]{8}$/i.test(workingStr)) {
    const fnsku = workingStr.toUpperCase();
    return {
      raw,
      code: fnsku,
      fnsku,
      symbology: "FNSKU",
      identifierType: "fnsku",
      isComposite: false,
    };
  }

  // Step 11: Clean Part Number / MPN / Model Prefixes: "P/N: SKF-6205", "MPN: 123", "MODEL: ABC-123"
  const cleanPrefixMatch = workingStr.match(/^(?:mpn|model|mod|cat\s*no|cat\s*#|p\/n|part\s*no|part\s*#|part|sku|mat\s*no|item\s*no)[\s:#]+(.+)$/i);
  if (cleanPrefixMatch) {
    const cleanCode = cleanPrefixMatch[1].trim();
    return {
      raw,
      code: cleanCode,
      partNumber: cleanCode,
      symbology: isFromCode39 ? "CODE-39" : "CUSTOM",
      identifierType: "mpn",
      isComposite: false,
    };
  }

  // Step 12: GTIN-14 / ITF-14 Outer Corrugated Cartons (14 digits)
  if (/^\d{14}$/.test(workingStr)) {
    const isValid = validateGs1CheckDigit(workingStr);
    const innerInfo = extractGtin14Inner(workingStr);

    if (workingStr.startsWith("00")) {
      // 00 prefix: Serial Shipping Container Code or Double-padded UPC
      const cleanGtin = workingStr.slice(2);
      return {
        raw,
        code: cleanGtin,
        gtin: cleanGtin,
        symbology: "GTIN-14",
        identifierType: "gtin",
        checkDigitValid: isValid,
        packagingLevel: "consumer_unit",
        isComposite: false,
      };
    }

    if (workingStr.startsWith("0")) {
      // Single padded EAN-13
      const cleanEan = workingStr.slice(1);
      return {
        raw,
        code: cleanEan,
        gtin: cleanEan,
        symbology: "EAN-13",
        identifierType: "gtin",
        checkDigitValid: isValid,
        packagingLevel: "consumer_unit",
        isComposite: false,
      };
    }

    return {
      raw,
      code: workingStr,
      gtin: workingStr,
      innerGtin: innerInfo?.innerEan13,
      symbology: "GTIN-14",
      identifierType: "gtin",
      checkDigitValid: isValid,
      packagingLevel: innerInfo?.packagingLevel ?? "outer_case",
      isComposite: false,
    };
  }

  // Step 13: JAN (Japanese Article Number) - 13 or 8 digits starting with 45 or 49
  if (/^(?:45|49)\d{11}$/.test(workingStr)) {
    const isValid = validateGs1CheckDigit(workingStr);
    return {
      raw,
      code: workingStr,
      gtin: workingStr,
      jan: workingStr,
      symbology: "JAN",
      identifierType: "jan",
      checkDigitValid: isValid,
      isComposite: false,
    };
  }
  if (/^(?:45|49)\d{6}$/.test(workingStr)) {
    const isValid = validateGs1CheckDigit(workingStr);
    return {
      raw,
      code: workingStr,
      gtin: workingStr,
      jan: workingStr,
      symbology: "JAN",
      identifierType: "jan",
      checkDigitValid: isValid,
      isComposite: false,
    };
  }

  // Step 14: EAN-13 (Standard 13-digit Retail)
  if (/^\d{13}$/.test(workingStr)) {
    const isValid = validateGs1CheckDigit(workingStr);
    return {
      raw,
      code: workingStr,
      gtin: workingStr,
      symbology: "EAN-13",
      identifierType: "gtin",
      checkDigitValid: isValid,
      packagingLevel: "consumer_unit",
      isComposite: false,
    };
  }

  // Step 15: UPC-A (12-digit North American Retail)
  if (/^\d{12}$/.test(workingStr)) {
    const isValid = validateGs1CheckDigit(workingStr);
    return {
      raw,
      code: workingStr,
      gtin: workingStr,
      symbology: "UPC-A",
      identifierType: "gtin",
      checkDigitValid: isValid,
      packagingLevel: "consumer_unit",
      isComposite: false,
    };
  }

  // Step 16: EAN-8 (8-digit Compact Retail)
  if (/^\d{8}$/.test(workingStr)) {
    const isValid = validateGs1CheckDigit(workingStr);
    return {
      raw,
      code: workingStr,
      gtin: workingStr,
      symbology: "EAN-8",
      identifierType: "gtin",
      checkDigitValid: isValid,
      packagingLevel: "consumer_unit",
      isComposite: false,
    };
  }

  // Step 17: Bare PZN check (7-8 digits matching PZN modulo 11)
  if (/^\d{7,8}$/.test(workingStr) && validatePzn(workingStr)) {
    return {
      raw,
      code: `PZN-${workingStr}`,
      pzn: `PZN-${workingStr}`,
      partNumber: workingStr,
      symbology: "PZN",
      identifierType: "pzn",
      checkDigitValid: true,
      isComposite: false,
    };
  }

  // Step 18: Code-39 / Code-128 / Industrial alphanumeric
  const sanitized = workingStr.replace(/[\x00-\x1f\x7f]/g, "").trim();
  const isCode39Chars = /^[0-9A-Z\-. $/+%]+$/.test(sanitized);

  return {
    raw,
    code: sanitized,
    partNumber: sanitized,
    symbology: isFromCode39 || isCode39Chars ? "CODE-39" : "CUSTOM",
    identifierType: "mpn",
    isComposite: false,
  };
}
