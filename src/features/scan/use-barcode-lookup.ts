"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { parseScannedBarcode } from "@/lib/industrial-barcode";
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
  const inFlightRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const onFoundRef = useRef(onFound);
  const onAutoFillRef = useRef(onAutoFill);
  useEffect(() => {
    onFoundRef.current = onFound;
    onAutoFillRef.current = onAutoFill;
  }, [onFound, onAutoFill]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const lookupBarcode = useCallback(async (rawCode: string, force = false) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const trimmed = rawCode.trim();
    if (!trimmed || trimmed.length < 3) {
      setStatus(null);
      return null;
    }

    // Decompose industrial / composite barcode to clean primary code
    const parsed = parseScannedBarcode(trimmed);
    const code = parsed.primaryCode || trimmed;

    if (!force && lastLookedUpRef.current === code) {
      return null;
    }

    if (inFlightRef.current && lastLookedUpRef.current === code) {
      return null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    inFlightRef.current = true;
    lastLookedUpRef.current = code;
    setLookingUp(true);
    setStatus({ tone: "info", text: "🔍 Looking up barcode details..." });

    try {
      const result = await apiRequest<BarcodeLookupResult>(`/skus/barcode-lookup?barcode=${encodeURIComponent(code)}`);

      if (controller.signal.aborted) return null;

      if (result.foundInDatabase && result.sku) {
        setStatus({
          tone: "warning",
          text: `⚠️ Barcode already assigned to SKU ${result.sku.code} · ${result.sku.name}.`,
          existingSkuId: result.sku.id,
          existingSkuCode: result.sku.code,
        });
        onFoundRef.current?.(result.sku);
        return result;
      }

      if (result.catalogDetails) {
        const symbologyBadge = result.catalogDetails.symbology ? `[${result.catalogDetails.symbology}] ` : "";
        setStatus({
          tone: "success",
          text: `✨ Detected ${symbologyBadge}"${result.catalogDetails.name}". Details auto-filled!`,
        });
        onAutoFillRef.current?.(result.catalogDetails);
        return result;
      }

      setStatus({ tone: "info", text: `Barcode ${code} recorded. Enter remaining product details.` });
      return result;
    } catch {
      if (!controller.signal.aborted) {
        setStatus({ tone: "error", text: "Could not look up barcode online. You can enter details manually." });
      }
      return null;
    } finally {
      if (abortControllerRef.current === controller) {
        inFlightRef.current = false;
        setLookingUp(false);
      }
    }
  }, []);

  const debouncedLookup = useCallback(
    (code: string, delayMs = 450) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (!code.trim() || code.trim().length < 8) return;
      debounceTimerRef.current = setTimeout(() => {
        void lookupBarcode(code, false);
      }, delayMs);
    },
    [lookupBarcode],
  );

  const dismissStatus = useCallback(() => {
    setStatus(null);
  }, []);

  return {
    lookingUp,
    status,
    setStatus,
    dismissStatus,
    lookupBarcode,
    debouncedLookup,
  };
}
