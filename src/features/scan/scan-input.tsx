"use client";

import { Camera, ScanLine } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form-controls";
import { cn } from "@/lib/cn";
import { CameraScanner, useCameraScanSupported } from "./camera-scanner";

export interface ScanStatus {
  tone: "success" | "error" | "info";
  text: string;
}

const STATUS_CLASS: Record<ScanStatus["tone"], string> = {
  success: "text-emerald-700",
  error: "text-red-600",
  info: "text-slate-600",
};

/**
 * Barcode / QR input. USB and Bluetooth scanners act as keyboards: they type
 * the code quickly and press Enter, so a focused input that submits on Enter
 * serves them (and manual typing). Where the browser supports it, "Use
 * camera" reads codes with the device camera instead. Enter never submits
 * the surrounding form.
 */
export function ScanInput({
  onScan,
  label = "Scan",
  placeholder = "Scan a barcode or type a code, then Enter",
  status,
  busy = false,
  autoFocus = false,
  className,
  inputClassName,
  compact = false,
}: {
  onScan: (code: string) => void;
  label?: string;
  placeholder?: string;
  /** Result of the last scan, shown under the input. */
  status?: ScanStatus | null;
  busy?: boolean;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  /** Icon-only camera button (tight spaces such as the header). */
  compact?: boolean;
}) {
  const [value, setValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraSupported = useCameraScanSupported();

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const code = value.trim();
    setValue("");
    if (code) onScan(code);
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <ScanLine className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            aria-label={label}
            value={value}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            autoFocus={autoFocus}
            aria-busy={busy || undefined}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            className={cn("pl-8", inputClassName)}
          />
        </div>
        {cameraSupported && (
          <Button
            variant="secondary"
            size={compact ? "icon" : "sm"}
            className={compact ? "h-9 w-9 shrink-0" : "h-9"}
            onClick={() => setCameraOpen(true)}
            aria-label="Use camera"
            title="Use camera"
          >
            <Camera aria-hidden /> {!compact && "Use camera"}
          </Button>
        )}
      </div>
      {status && (
        <p role="status" className={cn("mt-1 text-xs", STATUS_CLASS[status.tone])}>
          {status.text}
        </p>
      )}
      {cameraSupported && (
        <Dialog open={cameraOpen} onClose={() => setCameraOpen(false)} title={label}>
          {cameraOpen && (
            <CameraScanner
              onDetected={(code) => {
                setCameraOpen(false);
                onScan(code.trim());
              }}
            />
          )}
        </Dialog>
      )}
    </div>
  );
}
