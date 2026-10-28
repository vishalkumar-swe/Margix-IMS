"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { BarcodeLookupResult } from "@/server/modules/masters/barcode-lookup.service";

export interface BarcodeStatusMessage {
  tone: "success" | "warning" | "info" | "error";
  text: string;
  existingSkuId?: string;
  existingSkuCode?: string;
}

export type AutoFillCatalogDetails = NonNullable<BarcodeLookupResult["catalogDetails"]>;

export function useBarcodeLookup({
  onFound,
  onAutoFill,
}: {
  onFound?: (sku: NonNullable<BarcodeLookupResult["sku"]>) => void;
  onAutoFill?: (details: NonNullable<BarcodeLookupResult["catalogDetails"]>) => void;
} = {}) {
  const [lookingUp, setLookingUp] = useState(false);
  const [status, setStatus] = useState<BarcodeStatusMessage | null>(null);
  const lastLookedUpRef = useRef<string>("");

  const lookupBarcode = useCallback(
    async (rawCode: string, force = false) => {
      const code = rawCode.trim();
      if (!code || code.length < 3) {
        setStatus(null);
        return null;
      }
      if (!force && lastLookedUpRef.current === code) {
        return null;
      }
      lastLookedUpRef.current = code;
      setLookingUp(true);
      setStatus({ tone: "info", text: "🔍 Looking up barcode details..." });

      try {
        const result = await apiRequest<BarcodeLookupResult>(`/skus/barcode-lookup?barcode=${encodeURIComponent(code)}`);

        if (result.foundInDatabase && result.sku) {
          setStatus({
            tone: "warning",
            text: `⚠️ Barcode already assigned to SKU ${result.sku.code} · ${result.sku.name}.`,
            existingSkuId: result.sku.id,
            existingSkuCode: result.sku.code,
          });
          onFound?.(result.sku);
          return result;
        }

        if (result.catalogDetails) {
          setStatus({
            tone: "success",
            text: `✨ Detected "${result.catalogDetails.name}". Details auto-filled!`,
          });
          onAutoFill?.(result.catalogDetails);
          return result;
        }

        setStatus({ tone: "info", text: `Barcode ${code} recorded. Enter remaining product details.` });
        return result;
      } catch {
        setStatus({ tone: "error", text: "Could not look up barcode online. You can enter details manually." });
        return null;
      } finally {
        setLookingUp(false);
      }
    },
    [onFound, onAutoFill],
  );

  return {
    lookingUp,
    status,
    setStatus,
    lookupBarcode,
  };
}

