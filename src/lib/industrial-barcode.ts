/**
 * Industrial & Universal Barcode Parser
 * 
 * Supports all global barcode symbologies and industrial encoding standards:
 * - GS1-128 & GS1 DataMatrix with Application Identifiers (AI 01, 10, 17, 21, 30, 310x, 00)
 * - GS1 Digital Link URIs (Web QR codes & 2D barcodes)
 * - ISO/IEC 15434 & Automotive AIAG / DoD IUID direct part marks
 * - ITF-14 Outer Corrugated Cartons
 * - Alphanumeric Industrial Part Numbers (Code 39 / Code 128 / DataMatrix)
 * - Standard Retail & FMCG (EAN-13, EAN-8, UPC-A, UPC-E)
 */

export interface ParsedIndustrialBarcode {
  raw: string;
  code: string; // Primary lookup code (GTIN, SKU, or clean Part Number)
  primaryCode: string; // Alias to code for convenience
  secondaryCodes: string[]; // Alternate representations (e.g. 14-digit GTIN vs 13-digit EAN, raw vs stripped)
  isComposite: boolean;
  gtin?: string;
  partNumber?: string;
  batchNumber?: string;
  expiryDate?: string; // YYYY-MM-DD
  manufacturingDate?: string; // YYYY-MM-DD
  productionDate?: string; // Alias to manufacturingDate
  serialNumber?: string;
  quantity?: number;
  weightKg?: number;
  sscc?: string;
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

  // 50-99 -> 1950-1999; 00-49 -> 2000-2049
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
    }
  }
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
 * Parses any scanned barcode string:
 * 1. Checks GS1 Digital Link URLs
 * 2. Checks Bracketed GS1 Application Identifiers e.g. (01)08901234567890(17)261231(10)LOT123
 * 3. Checks FNC1-separated raw GS1-128 / GS1 DataMatrix
 * 4. Checks ISO/IEC 15434 Automotive / Military format
 * 5. Checks Prefixed Part Numbers (P/N: ..., PART: ...)
 * 6. Normalizes plain GTIN / EAN / UPC / Part Number
 */
export function parseScannedBarcode(rawInput: string): ParsedIndustrialBarcode {
  const raw = rawInput.trim();
  if (!raw) {
    return finalizeResult({ raw: "", code: "", isComposite: false }, "");
  }

  return finalizeResult(rawParseScannedBarcode(raw), raw);
}

function rawParseScannedBarcode(raw: string): Omit<ParsedIndustrialBarcode, "primaryCode" | "secondaryCodes"> {

  // 1. GS1 Digital Link URI e.g. https://id.gs1.org/01/08901234567890/10/BATCH123?17=261231
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const segments = url.pathname.split("/").filter(Boolean);
      const result: ParsedRaw = {
        raw,
        code: "",
        isComposite: true,
      };

      // Match path segments: /01/<gtin>/10/<batch>/17/<expiry>/21/<serial>
      for (let i = 0; i < segments.length; i += 2) {
        const ai = segments[i];
        const val = segments[i + 1];
        if (!val) continue;

        if (ai === "01") {
          result.gtin = val.length === 14 && val.startsWith("0") ? val.slice(1) : val;
          result.code = result.gtin;
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
        }
      }

      // Query params can also carry AIs: ?10=BATCH&17=YYMMDD
      url.searchParams.forEach((val, key) => {
        if (key === "01" && !result.code) {
          result.gtin = val.length === 14 && val.startsWith("0") ? val.slice(1) : val;
          result.code = result.gtin;
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

  // 2. Bracketed GS1 Application Identifiers: e.g. (01)08901234567890(17)261231(10)LOT123
  // Also supports square brackets [01]...[10]...
  const bracketMatches = [...raw.matchAll(/[\(\[](\d{2,4})[\)\]]([^\(\[]+)/g)];
  if (bracketMatches.length > 0) {
    const result: ParsedRaw = {
      raw,
      code: "",
      isComposite: true,
    };

    for (const match of bracketMatches) {
      const ai = match[1];
      const val = match[2].trim();

      if (ai === "01" || ai === "02") {
        result.gtin = val.length === 14 && val.startsWith("0") ? val.slice(1) : val;
        result.code = result.gtin;
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
        // Net weight in kg with decimals given by 4th digit
        const decimals = parseInt(ai.charAt(3), 10) || 0;
        result.weightKg = parseFloat(val) / Math.pow(10, decimals);
      } else if (ai === "00") {
        result.sscc = val;
      }
    }

    if (result.code) {
      return result;
    }
  }

  // 3. Raw GS1-128 / DataMatrix starting with 01 (GTIN-14)
  // Format: 01<14 digits>[17<6 digits>][10<batch>]...
  if (/^01\d{14}/.test(raw)) {
    const gtin14 = raw.slice(2, 16);
    const cleanGtin = gtin14.startsWith("0") ? gtin14.slice(1) : gtin14;
    let remainder = raw.slice(16);

    const result: ParsedRaw = {
      raw,
      code: cleanGtin,
      gtin: cleanGtin,
      isComposite: remainder.length > 0,
    };

    // Sequential GS1 AI parsing for fixed and variable fields
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

  // 4. ISO/IEC 15434 Automotive / DoD UID Part Marking
  // e.g. [)>*06:1P123456:1TBATCH:S9999* or [)>*05:...
  if (raw.startsWith("[)>") || raw.startsWith("[)><RS>")) {
    const fields = raw.split(/[\x1d\x1e:\*]/).filter(Boolean);
    const result: ParsedRaw = {
      raw,
      code: "",
      isComposite: true,
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

  // 5. Clean Part Number Prefixes: "P/N: SKF-6205", "PART NO: ABC-123", "SKU: XYZ"
  const cleanPrefixMatch = raw.match(/^(?:p\/n|part\s*no|part\s*#|part|sku|mat\s*no|item\s*no)[\s:#]+(.+)$/i);
  if (cleanPrefixMatch) {
    const cleanCode = cleanPrefixMatch[1].trim();
    return {
      raw,
      code: cleanCode,
      partNumber: cleanCode,
      isComposite: false,
    };
  }

  // 6. ITF-14 Outer Packaging Carton (14 digits)
  // Leading digit 1-8 indicates packaging level (e.g. 1 = inner pack, 2 = case)
  // Digits 2-13 are base GTIN-12
  if (/^\d{14}$/.test(raw) && !raw.startsWith("00")) {
    // If it starts with 0, it is a padded 13-digit EAN
    const cleanCode = raw.startsWith("0") ? raw.slice(1) : raw;
    return {
      raw,
      code: cleanCode,
      gtin: cleanCode,
      isComposite: false,
    };
  }

  // 7. Standard alphanumeric or numeric barcode (EAN, UPC, Code 128, Code 39)
  // Strips unprintable control characters (ASCII 0-31) often sent by serial scanners
  const sanitized = raw.replace(/[\x00-\x1f\x7f]/g, "").trim();
  return {
    raw,
    code: sanitized,
    isComposite: false,
  };
}
