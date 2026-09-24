/**
 * Code series: how every master code and document number is formed
 * (the "numbering master"). Pure definitions, shared by the server, which
 * allocates codes, and the UI, which previews them.
 *
 * Pattern tokens: {PREFIX}, {SEQ} (zero-padded counter, required), {YYYY}
 * (calendar year) and {FY} (Indian financial year, e.g. 2627). The counter
 * restarts whenever the period in the pattern changes: yearly with {YYYY} or
 * {FY}, never otherwise.
 */

import { istDateOf } from "@/lib/dates";

export type CodeSeriesKind = "master" | "document";

export interface CodeSeriesSettings {
  prefix: string;
  pattern: string;
  padding: number;
}

export interface CodeSeriesDefinition {
  label: string;
  kind: CodeSeriesKind;
  defaults: CodeSeriesSettings;
}

export const CODE_SERIES = {
  SKU: { label: "Products (SKUs)", kind: "master", defaults: { prefix: "SKU", pattern: "{PREFIX}-{SEQ}", padding: 6 } },
  CUSTOMER: { label: "Customers", kind: "master", defaults: { prefix: "CUS", pattern: "{PREFIX}-{SEQ}", padding: 6 } },
  SUPPLIER: { label: "Suppliers", kind: "master", defaults: { prefix: "SUP", pattern: "{PREFIX}-{SEQ}", padding: 6 } },
  GODOWN: { label: "Godowns", kind: "master", defaults: { prefix: "G", pattern: "{PREFIX}{SEQ}", padding: 3 } },
  PO: { label: "Purchase orders", kind: "document", defaults: { prefix: "PO", pattern: "{PREFIX}-{YYYY}-{SEQ}", padding: 6 } },
  GRN: { label: "Goods receipts", kind: "document", defaults: { prefix: "GRN", pattern: "{PREFIX}-{YYYY}-{SEQ}", padding: 6 } },
  INV: { label: "Invoices", kind: "document", defaults: { prefix: "INV", pattern: "{PREFIX}-{YYYY}-{SEQ}", padding: 6 } },
  DSP: { label: "Dispatches", kind: "document", defaults: { prefix: "DSP", pattern: "{PREFIX}-{YYYY}-{SEQ}", padding: 6 } },
  TRF: { label: "Transfers", kind: "document", defaults: { prefix: "TRF", pattern: "{PREFIX}-{YYYY}-{SEQ}", padding: 6 } },
  SRN: { label: "Customer returns", kind: "document", defaults: { prefix: "SRN", pattern: "{PREFIX}-{YYYY}-{SEQ}", padding: 6 } },
  PRN: { label: "Supplier returns", kind: "document", defaults: { prefix: "PRN", pattern: "{PREFIX}-{YYYY}-{SEQ}", padding: 6 } },
  ADJ: { label: "Stock adjustments", kind: "document", defaults: { prefix: "ADJ", pattern: "{PREFIX}-{YYYY}-{SEQ}", padding: 6 } },
  OPN: { label: "Opening stock", kind: "document", defaults: { prefix: "OPN", pattern: "{PREFIX}-{YYYY}-{SEQ}", padding: 6 } },
} as const satisfies Record<string, CodeSeriesDefinition>;

export type CodeSeriesKey = keyof typeof CODE_SERIES;
export const CODE_SERIES_KEYS = Object.keys(CODE_SERIES) as CodeSeriesKey[];

/** GST (CGST Rule 46): an invoice number may have at most 16 characters. */
export const MAX_INVOICE_NUMBER_LENGTH = 16;

const TOKEN = /\{(PREFIX|SEQ|YYYY|FY)\}/g;

/**
 * Indian financial year code (April–March, evaluated in IST), e.g. 2026-09-24 → "2627".
 */
export function financialYearCode(date: Date): string {
  const [year, month] = istDateOf(date).split("-").map(Number);
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear % 100).padStart(2, "0")}${String(endYear % 100).padStart(2, "0")}`;
}

/** The date values a pattern can use, in IST. */
export function codeDateParts(date: Date): { year: string; fy: string } {
  return { year: istDateOf(date).slice(0, 4), fy: financialYearCode(date) };
}

/** Counter period for a pattern at a date: "2026" for {YYYY}, "2627" for {FY}, "ALL" otherwise. */
export function periodOf(pattern: string, parts: { year: string; fy: string }): string {
  if (pattern.includes("{FY}")) return parts.fy;
  if (pattern.includes("{YYYY}")) return parts.year;
  return "ALL";
}

export function formatCode(settings: CodeSeriesSettings, seq: number, parts: { year: string; fy: string }): string {
  return settings.pattern.replace(TOKEN, (_, token: string) => {
    switch (token) {
      case "PREFIX":
        return settings.prefix;
      case "SEQ":
        return String(seq).padStart(settings.padding, "0");
      case "YYYY":
        return parts.year;
      default:
        return parts.fy;
    }
  });
}

/** Problems with a proposed series setting, as field → message (empty when valid). */
export function validateSeriesSettings(key: CodeSeriesKey, settings: CodeSeriesSettings): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!/^[A-Z0-9]{1,10}$/.test(settings.prefix)) errors.prefix = "Use 1–10 capital letters or digits.";
  if (!settings.pattern.includes("{SEQ}")) errors.pattern = "The pattern must contain {SEQ}.";
  else if (settings.pattern.split("{SEQ}").length > 2) errors.pattern = "Use {SEQ} only once.";
  else if (!/^[A-Z0-9/_.-]*$/.test(settings.pattern.replace(TOKEN, ""))) {
    errors.pattern = "Besides the tokens, use only capital letters, digits and - / _ .";
  } else if (settings.pattern.includes("{FY}") && settings.pattern.includes("{YYYY}")) {
    errors.pattern = "Use either {FY} or {YYYY}, not both.";
  }
  if (!Number.isInteger(settings.padding) || settings.padding < 3 || settings.padding > 10) {
    errors.padding = "Use 3 to 10 digits.";
  }
  if (!errors.pattern && !errors.prefix && !errors.padding && key === "INV") {
    const longest = formatCode(settings, 10 ** settings.padding - 1, { year: "2026", fy: "2627" });
    if (longest.length > MAX_INVOICE_NUMBER_LENGTH) {
      errors.pattern = `Invoice numbers may have at most ${MAX_INVOICE_NUMBER_LENGTH} characters under GST (this gives ${longest.length}).`;
    }
  }
  return errors;
}
