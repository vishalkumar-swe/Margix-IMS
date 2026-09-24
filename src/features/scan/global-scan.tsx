"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { ScanInput, type ScanStatus } from "./scan-input";
import { lookupDocument, lookupErrorMessage, lookupSku } from "./scan-lookup";

/**
 * Header scan box: scanning any document barcode / QR code opens that
 * document; scanning a product barcode opens the product's stock page.
 */
export function GlobalScan({ className }: { className?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [busy, setBusy] = useState(false);

  async function open(code: string) {
    setBusy(true);
    setStatus(null);
    try {
      const document = await lookupDocument(code);
      if (document) {
        router.push(document.url);
        return;
      }
      const sku = await lookupSku(code);
      if (sku) {
        router.push(`/stock/${sku.id}`);
        return;
      }
      setStatus({ tone: "error", text: `Nothing matches "${code}".` });
    } catch (error) {
      setStatus({ tone: "error", text: lookupErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <ScanInput
        label="Scan or find a document or product"
        placeholder="Scan / enter document no. or barcode"
        onScan={open}
        busy={busy}
        inputClassName="h-8"
      />
      {status && (
        <p
          role="status"
          className="absolute top-full right-0 left-0 mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 shadow-sm"
        >
          {status.text}
        </p>
      )}
    </div>
  );
}
