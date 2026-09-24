import { cn } from "@/lib/cn";
import { barcodeSvg, qrCodeSvg, type BarcodeOptions } from "@/server/print/barcodes";

/*
 * Server-rendered barcode / QR images. The SVG comes from the barcode
 * libraries (bars and glyph outlines only, never markup from user input).
 */

export async function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const svg = await qrCodeSvg(value);
  return (
    <div
      role="img"
      aria-label={label}
      title={value}
      className={cn("size-24 [&>svg]:size-full", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** A 1D barcode; falls back to the plain value when it cannot be encoded. */
export function Barcode({
  value,
  label,
  className,
  ...options
}: BarcodeOptions & { value: string; label: string; className?: string }) {
  const svg = barcodeSvg(value, options);
  if (!svg) return <span className={cn("font-mono text-xs", className)}>{value}</span>;
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("[&>svg]:h-auto [&>svg]:w-full", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
