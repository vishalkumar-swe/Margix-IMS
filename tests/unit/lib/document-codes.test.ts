import { describe, expect, it } from "vitest";
import { buildDocumentQrPayload, parseScannedDocument, scannableDocumentPath } from "@/lib/document-codes";

describe("document QR payload", () => {
  it("builds the documented pipe-separated format", () => {
    expect(
      buildDocumentQrPayload({
        type: "INV",
        number: "INV-2026-000001",
        date: "2026-09-27",
        gstin: "29AABCR5678K1Z2",
        total: "12345.00",
      }),
    ).toBe("MARGIX|INV|INV-2026-000001|2026-09-27|29AABCR5678K1Z2|12345.00");
  });

  it("writes a dash for a missing GSTIN or total", () => {
    expect(buildDocumentQrPayload({ type: "DSP", number: "DSP-2026-000004", date: "2026-09-27" })).toBe(
      "MARGIX|DSP|DSP-2026-000004|2026-09-27|-|-",
    );
  });

  it("round-trips through the scanner parser", () => {
    const payload = buildDocumentQrPayload({ type: "GRN", number: "GRN-2026-000010", date: "2026-09-27", total: "1.00" });
    expect(parseScannedDocument(payload)).toEqual({ type: "GRN", number: "GRN-2026-000010" });
  });
});

describe("parseScannedDocument", () => {
  it("takes anything else as a document number of any type", () => {
    expect(parseScannedDocument(" po-2026-000001 ")).toEqual({ type: null, number: "PO-2026-000001" });
  });

  it("is lenient about case in the payload header", () => {
    expect(parseScannedDocument("margix|prn|prn-2026-000002|2026-09-27|-|-")).toEqual({
      type: "PRN",
      number: "PRN-2026-000002",
    });
  });

  it("rejects empty values and payloads of unknown types or without a number", () => {
    expect(parseScannedDocument("   ")).toBeNull();
    expect(parseScannedDocument("MARGIX|XYZ|X-1|2026-09-27|-|-")).toBeNull();
    expect(parseScannedDocument("MARGIX|INV||2026-09-27|-|-")).toBeNull();
    expect(parseScannedDocument("MARGIX|")).toBeNull();
  });

  it("links each type to its page", () => {
    expect(scannableDocumentPath("DSP", "abc")).toBe("/dispatches/abc");
    expect(scannableDocumentPath("SRN", "abc")).toBe("/sales-returns/abc");
  });
});
