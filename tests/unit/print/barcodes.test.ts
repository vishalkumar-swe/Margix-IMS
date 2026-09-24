import { describe, expect, it } from "vitest";
import { barcodeSvg, qrCodeSvg } from "@/server/print/barcodes";

describe("printed codes", () => {
  it("renders Code 128 and EAN-13 barcodes as SVG", () => {
    expect(barcodeSvg("INV-2026-000001", { symbology: "code128" })).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
    expect(barcodeSvg("2000000000015")).toMatch(/^<svg/);
  });

  it("returns null for a value the symbology cannot encode", () => {
    expect(barcodeSvg("12345", { symbology: "ean13" })).toBeNull();
  });

  it("renders QR codes as SVG", async () => {
    const svg = await qrCodeSvg("MARGIX|INV|INV-2026-000001|2026-09-27|-|1180.00");
    expect(svg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
  });
});
