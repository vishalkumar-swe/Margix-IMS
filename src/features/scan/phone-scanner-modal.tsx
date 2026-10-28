"use client";

import { CheckCircle2, Loader2, QrCode, Smartphone, X } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api-client";

interface PhoneScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
}

export function PhoneScannerModal({
  open,
  onClose,
  onScan,
  title = "Use Phone as Barcode Reader",
}: PhoneScannerModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // 1. Initialize session on open
  useEffect(() => {
    if (!open) {
      setSessionId(null);
      setQrCodeDataUrl(null);
      setQrUrl(null);
      setPhoneConnected(false);
      setLastScanned(null);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    apiRequest<{ sessionId: string; qrUrl: string }>("/scan-session", { method: "POST" })
      .then(async (res) => {
        if (!active) return;
        setSessionId(res.sessionId);
        setQrUrl(res.qrUrl);
        const dataUrl = await QRCode.toDataURL(res.qrUrl, {
          margin: 1,
          width: 220,
          color: {
            dark: "#0f172a",
            light: "#ffffff",
          },
        });
        if (active) {
          setQrCodeDataUrl(dataUrl);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to initialize phone scan session.");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  // 2. Poll session for connection status & incoming barcodes
  useEffect(() => {
    if (!open || !sessionId) return;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await apiRequest<{ status: "waiting" | "connected"; barcodes: string[] }>(
          `/scan-session/${sessionId}`,
        );
        if (cancelled) return;

        if (res.status === "connected") {
          setPhoneConnected(true);
        }

        if (res.barcodes.length > 0) {
          const latest = res.barcodes[res.barcodes.length - 1];
          setLastScanned(latest);
          onScanRef.current(latest);

          // Close modal after brief confirmation so user sees their scanned product
          setTimeout(() => {
            if (!cancelled) {
              onClose();
            }
          }, 600);
        }
      } catch {
        // Retry silently on next poll
      }
    };

    const interval = window.setInterval(poll, 850);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [open, sessionId, onClose]);

  return (
    <Dialog open={open} onClose={onClose} title={title} className="max-w-md">
      <div className="flex flex-col items-center text-center p-2 space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
            <Loader2 className="size-8 animate-spin text-brand-500" />
            <p className="text-xs font-medium">Generating connection QR code...</p>
          </div>
        )}

        {!loading && qrCodeDataUrl && (
          <>
            <div className="relative rounded-2xl border-2 border-slate-200 bg-white p-3 shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCodeDataUrl} alt="Pairing QR code" className="size-48 rounded-lg" />

              {lastScanned && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-emerald-600/95 p-3 text-white backdrop-blur-xs animate-in zoom-in-95 duration-200">
                  <CheckCircle2 className="size-10 text-white animate-bounce" />
                  <p className="text-xs uppercase font-bold tracking-wider mt-1 text-emerald-100">Barcode Received</p>
                  <p className="font-mono text-base font-black truncate max-w-full px-2">{lastScanned}</p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-center gap-1.5">
                <span
                  className={
                    phoneConnected
                      ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-300"
                      : "inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-300 animate-pulse"
                  }
                >
                  <span className={`size-2 rounded-full ${phoneConnected ? "bg-emerald-500" : "bg-amber-500"}`} />
                  {phoneConnected ? "Phone Connected & Ready!" : "Waiting for phone..."}
                </span>
              </div>

              <p className="text-xs text-slate-600 font-medium max-w-xs">
                Scan this QR code using your phone camera. No app download needed — your phone instantly turns into a
                wireless barcode scanner!
              </p>
            </div>

            {qrUrl && (
              <div className="w-full pt-1">
                <a
                  href={qrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-brand-600 hover:text-brand-700 underline block"
                >
                  Or open scanner link in this browser tab
                </a>
              </div>
            )}
          </>
        )}

        <div className="w-full flex justify-end pt-2 border-t border-slate-100">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

