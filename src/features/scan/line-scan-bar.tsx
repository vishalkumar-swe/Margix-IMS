"use client";

import { useState } from "react";
import type { SkuOption } from "@/lib/options";
import { resolveScannedSku } from "./scan-lookup";
import { ScanInput, type ScanStatus } from "./scan-input";

/**
 * Scan bar for forms with product lines: resolves a scanned barcode or SKU
 * code among the products the form offers and hands it to `onProduct`, which
 * applies it (select, add a line, count +1…) and returns the confirmation to
 * show — or an error message string starting with "!" to show as an error.
 */
export function LineScanBar<T extends SkuOption>({
  products,
  onProduct,
  label = "Scan product",
  notOfferedReason = "cannot be used on this form",
  className,
}: {
  products: T[];
  onProduct: (sku: T) => string;
  label?: string;
  notOfferedReason?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [busy, setBusy] = useState(false);

  async function onScan(code: string) {
    setBusy(true);
    const result = await resolveScannedSku(products, code, notOfferedReason);
    setBusy(false);
    if ("error" in result) return setStatus({ tone: "error", text: result.error });
    const message = onProduct(result.sku);
    setStatus(message.startsWith("!") ? { tone: "error", text: message.slice(1) } : { tone: "success", text: message });
  }

  return (
    <ScanInput
      label={label}
      placeholder="Scan a product barcode or type its code, then Enter"
      status={status}
      busy={busy}
      onScan={onScan}
      className={className}
    />
  );
}
