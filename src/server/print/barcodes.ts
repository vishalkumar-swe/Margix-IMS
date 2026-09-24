import { toSVG } from "bwip-js/node";
import QRCode from "qrcode";
import { barcodeSymbology } from "@/lib/barcode";

/**
 * Barcode and QR code images for printed documents and labels, rendered on
 * the server as SVG markup (vector, so they print sharply at any size).
 * Scanners read them back through the lookup APIs (see lib/document-codes.ts).
 */

export interface BarcodeOptions {
  /** EAN-13 when the value is a valid one, Code 128 otherwise (default). */
  symbology?: "ean13" | "code128";
  /** Bar height in millimetres. */
  heightMm?: number;
  /** Print the value under the bars. */
  includeText?: boolean;
}

/** SVG markup of a 1D barcode, or null when the value cannot be encoded. */
export function barcodeSvg(value: string, options: BarcodeOptions = {}): string | null {
  try {
    return toSVG({
      bcid: options.symbology ?? barcodeSymbology(value),
      text: value,
      height: options.heightMm ?? 10,
      includetext: options.includeText ?? true,
      textxalign: "center",
      textsize: 9,
    });
  } catch {
    return null;
  }
}

/** SVG markup of a QR code (error correction M, no quiet zone; the layout adds space). */
export function qrCodeSvg(value: string): Promise<string> {
  return QRCode.toString(value, { type: "svg", errorCorrectionLevel: "M", margin: 0 });
}
