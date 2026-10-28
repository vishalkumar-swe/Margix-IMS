"use client";

import { Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PhoneScannerModal } from "./phone-scanner-modal";
import { PHONE_SESSION_STORAGE_KEY } from "./use-phone-scanner";

/**
 * "Use phone as barcode reader": renders a button that opens the phone scanner modal.
 * Scanning the QR code with any smartphone connects it as a wireless barcode reader
 * that types directly into this input in real-time.
 * Once paired, the phone stays connected across multiple product forms.
 */
export function PhoneScanButton({
  onScan,
  title = "Use mobile phone as barcode reader",
  compact = false,
}: {
  onScan: (code: string) => void;
  title?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hasPairedSession, setHasPairedSession] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PHONE_SESSION_STORAGE_KEY);
      setHasPairedSession(Boolean(stored));
    } catch {
      // ignore
    }
  }, [open]);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size={compact ? "icon" : "sm"}
        className={compact ? "relative h-9 w-9 shrink-0" : "relative h-9 shrink-0"}
        onClick={() => setOpen(true)}
        aria-label={title}
        title={hasPairedSession ? "Phone Scanner (Paired)" : title}
      >
        <Smartphone className="size-4" />
        {!compact && (
          <span className="ml-1 text-xs hidden sm:inline flex items-center gap-1.5">
            Phone Scanner
            {hasPairedSession && <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          </span>
        )}
        {compact && hasPairedSession && (
          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-emerald-500 animate-pulse" />
        )}
      </Button>
      <PhoneScannerModal open={open} onClose={() => setOpen(false)} onScan={onScan} title={title} />
    </>
  );
}
