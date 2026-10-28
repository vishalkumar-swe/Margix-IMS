"use client";

import { Smartphone } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PhoneScannerModal } from "./phone-scanner-modal";

/**
 * "Use phone as barcode reader": renders a button that opens a QR code modal.
 * Scanning the QR code with any smartphone connects it as a wireless barcode reader
 * that types directly into this input in real-time.
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

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size={compact ? "icon" : "sm"}
        className={compact ? "h-9 w-9 shrink-0" : "h-9 shrink-0"}
        onClick={() => setOpen(true)}
        aria-label={title}
        title={title}
      >
        <Smartphone className="size-4" />
        {!compact && <span className="ml-1 text-xs hidden sm:inline">Phone Scanner</span>}
      </Button>
      <PhoneScannerModal open={open} onClose={() => setOpen(false)} onScan={onScan} title={title} />
    </>
  );
}

