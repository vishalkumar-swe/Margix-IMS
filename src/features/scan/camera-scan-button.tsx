"use client";

import { Camera } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CameraScanner, useCameraScanSupported } from "./camera-scanner";

/**
 * "Scan with camera" for a plain input: opens the camera, and the code read is
 * handed to `onScan` (e.g. to fill a barcode field). Renders nothing where the
 * browser cannot read barcodes; USB/Bluetooth scanners type into the input.
 */
export function CameraScanButton({ onScan, title = "Scan with camera" }: { onScan: (code: string) => void; title?: string }) {
  const [open, setOpen] = useState(false);
  const supported = useCameraScanSupported();
  if (!supported) return null;

  return (
    <>
      <Button variant="secondary" size="icon" className="h-9 w-9 shrink-0" onClick={() => setOpen(true)} aria-label={title} title={title}>
        <Camera aria-hidden />
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title}>
        {open && (
          <CameraScanner
            onDetected={(code) => {
              setOpen(false);
              onScan(code.trim());
            }}
          />
        )}
      </Dialog>
    </>
  );
}

/** For inputs a scanner types into: Enter (sent by the scanner) never submits the surrounding form. */
export function preventEnterSubmit(event: { key: string; preventDefault: () => void }): void {
  if (event.key === "Enter") event.preventDefault();
}
